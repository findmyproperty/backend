-- Run once on production before deploying mobile push notifications.
CREATE TABLE IF NOT EXISTS mobile_push_devices (
  id INT NOT NULL AUTO_INCREMENT,
  userId INT NOT NULL,
  token VARCHAR(255) NOT NULL,
  platform VARCHAR(16) NOT NULL,
  createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY UQ_mobile_push_devices_token (token),
  KEY IDX_mobile_push_devices_user_id (userId)
);

-- One-time, hashed refresh credentials for native SecureStore sessions.
CREATE TABLE IF NOT EXISTS mobile_refresh_tokens (
  id INT NOT NULL AUTO_INCREMENT,
  userId INT NOT NULL,
  tokenHash VARCHAR(64) NOT NULL,
  expiresAt DATETIME NOT NULL,
  createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY UQ_mobile_refresh_tokens_hash (tokenHash),
  KEY IDX_mobile_refresh_tokens_user_id (userId)
);
