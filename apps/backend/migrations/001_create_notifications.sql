CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  recipient_id INT NOT NULL,
  actor_id INT NULL,

  type VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL,
  message VARCHAR(500) NOT NULL,

  reference_type VARCHAR(50) NULL,
  reference_id INT NULL,

  is_read TINYINT(1) NOT NULL DEFAULT 0,
  read_at DATETIME NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  INDEX idx_notifications_recipient (
    recipient_id,
    is_read,
    created_at
  ),

  INDEX idx_notifications_reference (
    reference_type,
    reference_id
  ),

  CONSTRAINT fk_notifications_recipient
    FOREIGN KEY (recipient_id)
    REFERENCES employees(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_notifications_actor
    FOREIGN KEY (actor_id)
    REFERENCES employees(id)
    ON DELETE SET NULL
);