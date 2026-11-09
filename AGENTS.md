# Project execution rules

- Apply the dev skill and the backend skill for backend work.
- This frontend and sibling ../tutien_pixel_be use real services exclusively.
- FE .env defines DATA_MODE=real and BACKEND_URL. BE .env owns MySQL credentials. Never print or commit secrets.
- All REST and Socket.IO requests must reach the actual BE. Player, account, inventory, currency and quest mutations must persist in the configured MySQL database through BE APIs.
- Do not enable browser mock APIs, intercept fetch with fake responses, substitute in-memory repositories, use fake Redis, or treat localStorage/JSON files as gameplay persistence.
- Verification involving API, persistence, gameplay or failover must use real BE/database/Redis dependencies. Report the actual missing dependency or error when unavailable.
- Do not use .backend-staging or .backend-validation copies as the running backend or as runtime verification evidence. The canonical BE is D:\Work\game\tu-tien-server\tutien_pixel_be.
- Pure rendering and client prediction may run locally. Authoritative gameplay and stored results belong to BE.
- Read current source and preserve existing user changes. Run build/test only when requested under the dev workflow. Use real dependencies for request/persistence verification.
