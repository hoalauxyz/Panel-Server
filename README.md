# Palworld Server Panel

Web panel client–server để chỉnh `PalWorldSettings.ini` và restart container Palworld.

```
palworld-panel/
├── backend/     Node.js + Express — đọc/ghi .ini, docker restart
└── frontend/    React + Vite + Tailwind — dashboard, build ra dist/ cho Cloudflare Pages
```

---

## 1. Backend

### Cài đặt

```bash
cd backend && npm install && cp .env.example .env
```

Sửa `.env`:

| Biến | Mô tả |
|---|---|
| `PAL_CONFIG_PATH` | Đường dẫn tuyệt đối tới `PalWorldSettings.ini` |
| `PAL_CONTAINER` | Tên container Docker (mặc định `palworld-server`) |
| `API_KEY` | Secret bắt buộc ở header `x-api-key`. **Đừng để trống khi mở ra internet** |
| `CORS_ORIGIN` | Danh sách origin được phép, phân tách bằng dấu phẩy (domain Cloudflare Pages của bạn) |
| `BACKUP_RETENTION` | Số bản backup `.ini` giữ lại trước mỗi lần ghi (mặc định 10) |

```bash
npm run dev     # dev, tự reload
npm start       # production
npm test        # 9 test cho parser .ini
```

### API

| Method | Endpoint | Mô tả |
|---|---|---|
| `GET` | `/health` | Liveness, không cần key |
| `GET` | `/api/schema` | Min/max của từng field, không cần key |
| `GET` | `/api/config` | Trả JSON 5 key được quản lý |
| `PUT` | `/api/config` | Validate → merge → ghi file (atomic + backup) |
| `GET` | `/api/config/raw` | File `.ini` thô, để debug |
| `POST` | `/api/restart-server` | `docker restart <container>` |
| `GET` | `/api/status` | Trạng thái container qua `docker inspect` |

```bash
curl -H "x-api-key: $API_KEY" http://localhost:8080/api/config
```

```json
{
  "ok": true,
  "settings": {
    "ExpRate": 1,
    "PalCaptureRate": 1,
    "DayTimeSpeedRate": 1,
    "ServerName": "Default Palworld Server",
    "ServerPassword": ""
  },
  "meta": { "path": "/home/USER/...", "missingKeys": [], "totalKeys": 8 }
}
```

### Vì sao parser không dùng `split(',')`

`OptionSettings` là **một dòng duy nhất** với hàng chục key. Tách bằng `split(',')` sẽ
làm hỏng `ServerName="Palworld VN, Season 2"`. Parser trong
[`palConfig.js`](backend/src/services/palConfig.js) tách theo độ sâu ngoặc và trạng thái
trong/ngoài dấu nháy, và **chỉ ghi đè 5 key được quản lý** — mọi key khác
(`bIsPvP`, `BaseCampWorkerMaxNum`, …) giữ nguyên byte-for-byte.

### Quyền cần có trên VPS

User chạy Node phải:

1. Thuộc group `docker` — `sudo usermod -aG docker $USER` rồi đăng nhập lại.
2. Ghi được thư mục `.../Config/LinuxServer/`.

Có sẵn [`palworld-panel.service`](backend/palworld-panel.service) cho systemd.

### Đặt sau reverse proxy

Chỉ expose API qua HTTPS, đừng mở cổng 8080 trực tiếp:

```nginx
server {
    server_name pal-api.example.com;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 2. Frontend

```bash
cd frontend && npm install && cp .env.example .env
npm run dev       # http://localhost:5173, proxy /api sang localhost:8080
npm run build     # -> dist/
```

`VITE_API_BASE` để trống nếu API cùng origin; điền URL đầy đủ nếu API ở domain khác.

### Deploy lên Cloudflare Pages

Build output đã cấu hình sẵn: `dist/` chứa `_headers` (cache immutable cho
`/assets/*`) và `_redirects` (SPA fallback), cả hai được copy từ `public/`.

**Cách A — Git integration:** trỏ Pages vào repo và đặt

| Setting | Giá trị |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `frontend` |

Thêm biến môi trường `VITE_API_BASE` và `VITE_API_KEY` trong **Settings → Environment variables**.

**Cách B — Wrangler CLI:**

```bash
cd frontend && npx wrangler pages deploy dist
```

Sau khi có domain Pages, thêm nó vào `CORS_ORIGIN` của backend rồi restart API.

> **Lưu ý bảo mật:** `VITE_API_KEY` được nhúng vào bundle JS nên bất kỳ ai mở
> DevTools đều đọc được. Nó chỉ chặn bot quét cổng, không phải xác thực thật.
> Nếu panel để công khai, hãy đặt sau Cloudflare Access hoặc Basic Auth ở reverse proxy.

---

## 3. Luồng "Lưu & Khởi động lại Server"

Hai API chạy **tuần tự chứ không song song** — nếu chạy song song, container có thể
boot xong trước khi file kịp ghi và sẽ đọc phải config cũ:

```
PUT /api/config  ──ok──>  POST /api/restart-server  ──>  toast + poll lại /api/status
       │
       └──lỗi──>  huỷ restart, giữ nguyên form, báo lỗi
```

Các bảo vệ khác: xác nhận trước khi restart (vì sẽ kick hết người chơi),
cooldown 15 giây phía server, rate limit 6 lần restart / 5 phút,
cảnh báo `beforeunload` khi còn thay đổi chưa lưu.

---

## 4. Đã kiểm chứng

- `npm test` trong `backend/` — 9/9 pass (comma trong tên server, escape dấu nháy,
  giữ key không quản lý, chặn range ngoài 0.5–3.0, chặn newline injection).
- Chạy thật API trên file `.ini` mẫu: `GET`/`PUT` đúng, backup được tạo,
  401 khi thiếu key, 422 khi `ExpRate=99`, và `/api/restart-server` trả lỗi có
  ngữ cảnh khi không tìm thấy `docker`.
- `npm run build` trong `frontend/` — build sạch, `dist/` gồm `_headers`, `_redirects`.
