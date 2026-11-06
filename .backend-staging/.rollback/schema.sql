CREATE DATABASE IF NOT EXISTS tu_tien_pixel CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE tu_tien_pixel;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY, username VARCHAR(32) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL, role ENUM('PLAYER', 'GM', 'ADMIN') NOT NULL DEFAULT 'PLAYER',
  status ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE', created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME(3) NOT NULL, revoked_at DATETIME(3) NULL, replaced_by_hash CHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_refresh_user_active (user_id, revoked_at, expires_at),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS players (
  id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL UNIQUE, name VARCHAR(24) NOT NULL UNIQUE,
  gender ENUM('MALE', 'FEMALE') NOT NULL DEFAULT 'MALE', linh_can VARCHAR(32) NOT NULL DEFAULT 'KIM',
  realm_code VARCHAR(64) NOT NULL, realm_stage INT NOT NULL DEFAULT 1, tu_vi BIGINT NOT NULL DEFAULT 0,
  tu_vi_linh_can BIGINT NOT NULL DEFAULT 0, hp INT NOT NULL DEFAULT 100, max_hp INT NOT NULL DEFAULT 100,
  mp INT NOT NULL DEFAULT 50, max_mp INT NOT NULL DEFAULT 50,
  map_code VARCHAR(64) NOT NULL, x DOUBLE NOT NULL, y DOUBLE NOT NULL, version BIGINT NOT NULL DEFAULT 1,
  str_stat INT NOT NULL DEFAULT 5, agi_stat INT NOT NULL DEFAULT 5, vit_stat INT NOT NULL DEFAULT 5,
  ene_stat INT NOT NULL DEFAULT 5, unspent_points INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_players_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS wallets (
  player_id VARCHAR(64) PRIMARY KEY, xu BIGINT NOT NULL DEFAULT 0, linh_thach BIGINT NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 1, CONSTRAINT fk_wallet_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS inventory_items (
  id VARCHAR(64) PRIMARY KEY, player_id VARCHAR(64) NOT NULL, item_code VARCHAR(64) NOT NULL,
  quantity INT NOT NULL, slot INT NOT NULL, version BIGINT NOT NULL DEFAULT 1,
  UNIQUE KEY uq_inventory_item (player_id, item_code), CONSTRAINT fk_inventory_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS player_equipment (
  player_id VARCHAR(64) NOT NULL, slot VARCHAR(24) NOT NULL, item_code VARCHAR(64) NOT NULL,
  version BIGINT NOT NULL DEFAULT 1, PRIMARY KEY (player_id, slot), UNIQUE KEY uq_equipment_item (player_id, item_code),
  CONSTRAINT fk_equipment_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS player_skills (
  player_id VARCHAR(64) NOT NULL, skill_code VARCHAR(64) NOT NULL, learned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (player_id, skill_code), CONSTRAINT fk_player_skill_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS player_equipped_skills (
  player_id VARCHAR(64) NOT NULL, slot TINYINT UNSIGNED NOT NULL, skill_code VARCHAR(64) NOT NULL,
  PRIMARY KEY (player_id, slot), UNIQUE KEY uq_equipped_skill (player_id, skill_code),
  CONSTRAINT fk_equipped_skill_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS player_quests (
  player_id VARCHAR(64) NOT NULL, quest_id VARCHAR(64) NOT NULL,
  status ENUM('available', 'active', 'ready', 'completed') NOT NULL,
  progress INT UNSIGNED NOT NULL DEFAULT 0, version BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, quest_id), CONSTRAINT fk_player_quest_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS player_quest_meta (
  player_id VARCHAR(64) PRIMARY KEY, revision BIGINT UNSIGNED NOT NULL DEFAULT 0, tracked_id VARCHAR(64) NULL,
  CONSTRAINT fk_player_quest_meta_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS admin_worlds (
  code VARCHAR(64) PRIMARY KEY, status ENUM('DRAFT', 'PUBLISHED', 'DELETED') NOT NULL DEFAULT 'DRAFT', version BIGINT NOT NULL DEFAULT 1,
  document_json JSON NOT NULL, updated_by VARCHAR(64) NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS admin_content_records (
  collection_name VARCHAR(32) NOT NULL, record_id VARCHAR(96) NOT NULL, document_json JSON NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE, version BIGINT NOT NULL DEFAULT 1, updated_by VARCHAR(64) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (collection_name, record_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS skill_vfx_profiles (
  skill_code VARCHAR(64) PRIMARY KEY, profile_json JSON NOT NULL, updated_by VARCHAR(64) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id VARCHAR(64) PRIMARY KEY, actor_id VARCHAR(64) NOT NULL, action VARCHAR(48) NOT NULL, resource VARCHAR(128) NOT NULL,
  before_json JSON NULL, after_json JSON NULL, request_id VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), KEY ix_admin_audit_resource (resource, created_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS currency_ledger (
  id VARCHAR(64) PRIMARY KEY, player_id VARCHAR(64) NOT NULL, reason VARCHAR(32) NOT NULL,
  amount BIGINT NOT NULL, balance_after BIGINT NOT NULL, idempotency_key VARCHAR(80) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY uq_ledger_idempotency (player_id, idempotency_key),
  CONSTRAINT fk_ledger_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id VARCHAR(64) NOT NULL, request_id VARCHAR(80) NOT NULL, result_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (user_id, request_id),
  CONSTRAINT fk_idempotency_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS player_action_ledger (
  id VARCHAR(64) PRIMARY KEY, player_id VARCHAR(64) NOT NULL, action VARCHAR(32) NOT NULL,
  idempotency_key VARCHAR(80) NOT NULL, payload_json JSON NOT NULL, before_json JSON NOT NULL, after_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY uq_player_action_idempotency (player_id, idempotency_key),
  CONSTRAINT fk_player_action_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS loot_pickups (
  drop_id VARCHAR(96) PRIMARY KEY, player_id VARCHAR(64) NOT NULL, item_code VARCHAR(64) NOT NULL,
  quantity INT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_loot_pickup_player FOREIGN KEY (player_id) REFERENCES players(id)
) ENGINE=InnoDB;
