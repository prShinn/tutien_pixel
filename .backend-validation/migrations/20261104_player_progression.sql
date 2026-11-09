CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  replaced_by_hash CHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_refresh_user_active (user_id, revoked_at, expires_at),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

ALTER TABLE players
  ADD COLUMN gender ENUM('MALE', 'FEMALE') NOT NULL DEFAULT 'MALE' AFTER name,
  ADD COLUMN linh_can VARCHAR(32) NOT NULL DEFAULT 'KIM' AFTER gender,
  ADD COLUMN tu_vi_linh_can BIGINT NOT NULL DEFAULT 0 AFTER tu_vi,
  ADD COLUMN hp INT NOT NULL DEFAULT 100 AFTER tu_vi_linh_can,
  ADD COLUMN max_hp INT NOT NULL DEFAULT 100 AFTER hp,
  ADD COLUMN mp INT NOT NULL DEFAULT 50 AFTER max_hp,
  ADD COLUMN max_mp INT NOT NULL DEFAULT 50 AFTER mp;

ALTER TABLE players
  MODIFY COLUMN x DOUBLE NOT NULL,
  MODIFY COLUMN y DOUBLE NOT NULL;

UPDATE players
SET max_hp = 100 + vit_stat * 12,
    hp = 100 + vit_stat * 12,
    max_mp = 50 + ene_stat * 8,
    mp = 50 + ene_stat * 8;

CREATE TABLE IF NOT EXISTS player_action_ledger (
  id VARCHAR(64) PRIMARY KEY,
  player_id VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL,
  idempotency_key VARCHAR(80) NOT NULL,
  payload_json JSON NOT NULL,
  before_json JSON NOT NULL,
  after_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_player_action_idempotency (player_id, idempotency_key),
  CONSTRAINT fk_player_action_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS loot_pickups (
  drop_id VARCHAR(96) PRIMARY KEY,
  player_id VARCHAR(64) NOT NULL,
  item_code VARCHAR(64) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_loot_pickup_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS player_equipment (
  player_id VARCHAR(64) NOT NULL,
  slot VARCHAR(24) NOT NULL,
  item_code VARCHAR(64) NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, slot),
  UNIQUE KEY uq_equipment_item (player_id, item_code),
  CONSTRAINT fk_equipment_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS player_skills (
  player_id VARCHAR(64) NOT NULL,
  skill_code VARCHAR(64) NOT NULL,
  learned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (player_id, skill_code),
  CONSTRAINT fk_player_skill_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS player_equipped_skills (
  player_id VARCHAR(64) NOT NULL,
  slot TINYINT UNSIGNED NOT NULL,
  skill_code VARCHAR(64) NOT NULL,
  PRIMARY KEY (player_id, slot),
  UNIQUE KEY uq_equipped_skill (player_id, skill_code),
  CONSTRAINT fk_equipped_skill_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS player_quests (
  player_id VARCHAR(64) NOT NULL,
  quest_id VARCHAR(64) NOT NULL,
  status ENUM('available', 'active', 'ready', 'completed') NOT NULL,
  progress INT UNSIGNED NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, quest_id),
  CONSTRAINT fk_player_quest_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS player_quest_meta (
  player_id VARCHAR(64) PRIMARY KEY,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  tracked_id VARCHAR(64) NULL,
  CONSTRAINT fk_player_quest_meta_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_worlds (
  code VARCHAR(64) PRIMARY KEY,
  status ENUM('DRAFT', 'PUBLISHED', 'DELETED') NOT NULL DEFAULT 'DRAFT',
  version BIGINT NOT NULL DEFAULT 1,
  document_json JSON NOT NULL,
  updated_by VARCHAR(64) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_content_records (
  collection_name VARCHAR(32) NOT NULL,
  record_id VARCHAR(96) NOT NULL,
  document_json JSON NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  version BIGINT NOT NULL DEFAULT 1,
  updated_by VARCHAR(64) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (collection_name, record_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS skill_vfx_profiles (
  skill_code VARCHAR(64) PRIMARY KEY,
  profile_json JSON NOT NULL,
  updated_by VARCHAR(64) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  actor_id VARCHAR(64) NOT NULL,
  action VARCHAR(48) NOT NULL,
  resource VARCHAR(128) NOT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  request_id VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_admin_audit_resource (resource, created_at)
) ENGINE=InnoDB;
