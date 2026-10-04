# ai-cam-fe

Frontend của Hệ thống X. Một app React gồm hai khu vực:

- `/station`: màn hình kiosk tại bàn đóng gói.
- `/admin`: dashboard quản lý.

Tài liệu nằm ở repo gốc `AI-cam-shop-managment/docs/`:

- `ai/items/01-packing-mvp/02b-fe-spec-station.md` và `02b-fe-spec-admin.md`: spec frontend.
- `ai/items/01-packing-mvp/02-tech-spec.md` §6: API contract.
- `design-system/README.md`: token, component, giọng văn.

## Yêu cầu

Node 24 và pnpm 12.

## Lệnh

| Việc                                       | Lệnh                                                              |
| ------------------------------------------ | ----------------------------------------------------------------- |
| Cài phụ thuộc                              | `pnpm install`                                                    |
| Chạy dev (gọi API thật ở `localhost:8180`) | `pnpm dev`, mở http://localhost:5180                              |
| Chạy dev với mock API (MSW, có từ T-33)    | `pnpm dev:mock`                                                   |
| Lint                                       | `pnpm lint` và `pnpm format:check`                                |
| Type check                                 | `pnpm typecheck`                                                  |
| Unit / component test                      | `pnpm test`                                                       |
| E2E (Playwright, tự bật `dev:mock`)        | `pnpm e2e` (lần đầu chạy `pnpm exec playwright install chromium`) |
| Build                                      | `pnpm build`                                                      |
| Sinh type API từ OpenAPI của BE            | `pnpm gen:api` (BE phải đang chạy)                                |

- Proxy dev: `/api` và `/ws` chuyển tới `API_URL`, mặc định `http://localhost:8180`, tức stack dev của `ai-cam-be`.
- Font (Be Vietnam Pro, JetBrains Mono, Material Symbols) được đóng gói cùng bundle, không tải từ Google Fonts, để station chạy được khi kho mất Internet.
