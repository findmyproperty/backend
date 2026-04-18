import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Stop, TripEstimate } from './entities/service-request.entity';

interface Coord {
  lat: number;
  lng: number;
}

interface CacheEntry {
  expiresAt: number;
  estimate: TripEstimate;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 200;

/**
 * Thin wrapper around the Google Distance Matrix API used to compute an
 * ordered multi-stop route summary (pickup → drop[0] → drop[1] → ...).
 *
 * Why sequential Distance Matrix calls: Distance Matrix returns one
 * origin→destination pair per result; it does not support "waypoints"
 * as Directions does. For the small N we support (≤5 drops) the extra
 * request cost is acceptable and the code stays simple. Results are
 * cached per ordered coord list (rounded) so form tweaks on the client
 * don't rebill the same route.
 */
@Injectable()
export class DistanceService {
  private readonly logger = new Logger(DistanceService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly config: ConfigService) {}

  async estimate(pickup: Coord, drops: Coord[]): Promise<TripEstimate | null> {
    if (drops.length === 0) return null;
    const key = this.cacheKey(pickup, drops);
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.estimate;

    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.logger.warn(
        'Distance Matrix skipped: no GOOGLE_MAPS_SERVER_KEY or NEXT_PUBLIC_GOOGLE_MAP_KEY configured.',
      );
      return null;
    }

    const legs: Array<{ distanceKm: number; durationMin: number }> = [];
    let prev: Coord = pickup;
    for (const next of drops) {
      const leg = await this.fetchLeg(prev, next, apiKey);
      if (!leg) return null;
      legs.push(leg);
      prev = next;
    }

    const totalDistanceKm = +legs
      .reduce((a, l) => a + l.distanceKm, 0)
      .toFixed(2);
    const totalDurationMin = Math.round(
      legs.reduce((a, l) => a + l.durationMin, 0),
    );
    const estimate: TripEstimate = {
      distanceKm: totalDistanceKm,
      durationMin: totalDurationMin,
      legs,
      calculatedAt: new Date().toISOString(),
    };
    this.put(key, estimate);
    return estimate;
  }

  /** Convenience wrapper when callers are working with Stop records directly. */
  async estimateForStops(
    pickup: Stop | undefined,
    drops: Stop[] | undefined,
  ): Promise<TripEstimate | null> {
    if (!pickup || !drops?.length) return null;
    return this.estimate(
      { lat: pickup.lat, lng: pickup.lng },
      drops.map((d) => ({ lat: d.lat, lng: d.lng })),
    );
  }

  private async fetchLeg(
    origin: Coord,
    destination: Coord,
    apiKey: string,
  ): Promise<{ distanceKm: number; durationMin: number } | null> {
    const url = new URL(
      'https://maps.googleapis.com/maps/api/distancematrix/json',
    );
    url.searchParams.set('origins', `${origin.lat},${origin.lng}`);
    url.searchParams.set(
      'destinations',
      `${destination.lat},${destination.lng}`,
    );
    url.searchParams.set('units', 'metric');
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('key', apiKey);
    try {
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        this.logger.warn(
          `Distance Matrix HTTP ${res.status} for ${origin.lat},${origin.lng} -> ${destination.lat},${destination.lng}`,
        );
        return null;
      }
      const data = (await res.json()) as DistanceMatrixResponse;
      if (data.status !== 'OK') {
        this.logger.warn(
          `Distance Matrix status=${data.status} (${data.error_message ?? ''})`,
        );
        return null;
      }
      const element = data.rows?.[0]?.elements?.[0];
      if (!element || element.status !== 'OK') return null;
      return {
        distanceKm: +(element.distance.value / 1000).toFixed(2),
        durationMin: Math.round(element.duration.value / 60),
      };
    } catch (err) {
      this.logger.warn(`Distance Matrix error: ${(err as Error).message}`);
      return null;
    }
  }

  private cacheKey(pickup: Coord, drops: Coord[]): string {
    const round = (n: number) => n.toFixed(4);
    return [
      `${round(pickup.lat)},${round(pickup.lng)}`,
      ...drops.map((d) => `${round(d.lat)},${round(d.lng)}`),
    ].join('|');
  }

  private put(key: string, estimate: TripEstimate) {
    // Basic bounded LRU-ish eviction: drop oldest when full.
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      estimate,
    });
  }

  private getApiKey(): string | null {
    const serverKey = this.config.get<string>('GOOGLE_MAPS_SERVER_KEY');
    if (serverKey) return serverKey;
    const publicKey = this.config.get<string>('NEXT_PUBLIC_GOOGLE_MAP_KEY');
    return publicKey ?? null;
  }
}

interface DistanceMatrixResponse {
  status: string;
  error_message?: string;
  rows?: Array<{
    elements?: Array<{
      status: string;
      distance: { value: number; text: string };
      duration: { value: number; text: string };
    }>;
  }>;
}
