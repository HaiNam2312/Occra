# Occra: hướng dẫn setup và deploy

Occra gồm hai phần:

- **site**: giao diện web (HTML + CSS + JS), host trên Cloudflare Pages.
- **api**: một Cloudflare Worker nhỏ, giữ YouTube API key ở server và cache kết quả tìm kiếm, để người dùng không phải tự tạo key.

## Chuẩn bị

- Node.js (bản LTS)
- Tài khoản Cloudflare (miễn phí)
- Tài khoản Google (để lấy YouTube API key)

## 1. Sắp xếp folder

```
occra/
├── site/
│   ├── index.html   ← đổi tên từ occra.html
│   └── style.css
└── api/
    ├── worker.js
    └── wrangler.toml
```

Tách riêng để khi đưa site lên mạng thì `worker.js` và `wrangler.toml` không bị upload theo.

## 2. Lấy YouTube API key

1. Vào https://console.cloud.google.com và tạo project mới.
2. Vào **APIs & Services → Library**, tìm "YouTube Data API v3" rồi bấm **Enable**.
3. Vào **Credentials → Create credentials → API key**.
4. Bấm vào key vừa tạo, ở mục **API restrictions** chọn chỉ cho phép YouTube Data API v3.

## 3. Deploy Worker (phần API)

```bash
cd occra/api
npm i -g wrangler
wrangler login
wrangler secret put YT_KEY      # dán API key vào khi được hỏi
wrangler deploy
```

- Nếu được hỏi tạo Worker mới tên `occra-api` thì chọn Yes. Lần đầu có thể phải đặt một subdomain `workers.dev`.
- Cuối cùng nó in ra URL dạng `https://occra-api.<tên-bạn>.workers.dev`.
- Kiểm tra: mở `<URL>/search?q=lofi` trên trình duyệt. Thấy JSON là Worker chạy được.

## 4. Gắn URL Worker vào web

Mở `site/index.html`, tìm dòng:

```js
var API='https://YOUR-WORKER.workers.dev';
```

và thay bằng URL Worker của bạn.

## 5. Test trên máy

```bash
cd occra/site
python3 -m http.server 8000
```

Mở http://localhost:8000 rồi thử: tìm một bài, dán link video, nhập một playlist.

> Đừng mở thẳng file `index.html` bằng `file://`. YouTube có thể báo lỗi 153 khi trang không có referrer.

## 6. Đưa site lên mạng (Cloudflare Pages)

```bash
cd occra
npx wrangler pages deploy site --project-name occra
```

Xong là có site tại `https://occra.pages.dev`. Cloudflare cũng cho kéo thả thư mục `site` trong dashboard (Workers & Pages → Create → Pages → Upload assets). Dashboard có thể đẩy bạn sang Workers, nhưng cách CLI ở trên vẫn dùng được. Muốn host chỗ khác thì GitHub Pages cũng được, chỉ cần upload thư mục `site`.

## 7. Khoá Worker lại cho site của bạn

Mở `api/wrangler.toml`, đổi:

```toml
ALLOWED_ORIGIN = "https://occra.pages.dev"
```

(đúng địa chỉ site của bạn, không có dấu `/` cuối), rồi deploy lại:

```bash
cd occra/api
wrangler deploy
```

Secret `YT_KEY` đã lưu từ trước nên không phải nhập lại.

Lưu ý:

- Worker chỉ nhận **một** origin. Sau bước này test từ localhost sẽ bị chặn. Cần test thì tạm đổi lại thành `"*"`.
- Bước này chỉ chặn web của người khác dùng Worker của bạn, không chặn được ai gọi trực tiếp bằng công cụ như curl. Để chắc hơn, vào dashboard Cloudflare (mục Security → rate limiting) đặt giới hạn request theo IP, nếu gói miễn phí của bạn cho phép.

## Quota YouTube

- Hạn mức là 10.000 đơn vị mỗi ngày cho cả project.
- Mỗi từ khoá tìm kiếm **mới** tốn 100 đơn vị, tức khoảng 100 từ khoá khác nhau mỗi ngày. Từ khoá lặp lại được cache 24 giờ nên không tốn thêm.
- Nhập playlist rẻ hơn nhiều: khoảng 1 đơn vị cho mỗi 50 bài.
- Hết quota thì tìm kiếm báo lỗi đến hôm sau. Dán link video và phát nhạc vẫn chạy bình thường.
- Web đông người thì có thể xin Google nâng quota (miễn phí).

## Cách dùng

- Ô nhập bên phải tự nhận ba kiểu: dán link hoặc ID video thì thêm thẳng; dán link playlist (có `list=`) thì nhập cả playlist (tối đa 300 bài); gõ chữ thì tìm kiếm.
- Nhập playlist chỉ hoạt động với playlist công khai hoặc unlisted. Playlist riêng tư, Liked videos, Watch Later và Mix tự động (`list=RD...`) thì không nhập được.
- Kéo thả hoặc dùng nút ▲▼ để sắp xếp. Tên danh sách phát bấm vào để sửa trực tiếp.
- Danh sách lưu trong trình duyệt của từng người (localStorage), chưa đồng bộ giữa các thiết bị.

## Khi bị lỗi

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| "Cannot reach the server" | URL Worker sai, hoặc `ALLOWED_ORIGIN` không khớp địa chỉ site. Chạy `wrangler tail` trong thư mục `api` để xem log trực tiếp. |
| "API error: ... quota" | Hết hạn mức YouTube trong ngày, đợi hôm sau. |
| "Set API in occra.html to your Worker URL first" | Chưa thay `YOUR-WORKER` ở bước 4. |
| Video báo lỗi phát (ví dụ 153) | Mở bằng `file://`, hãy chạy qua `http://localhost` hoặc site đã deploy. |
| Một bài tự bị bỏ qua | Chủ video cấm embed hoặc video đã bị xoá. |

## Giới hạn cần biết

- Quảng cáo trong video embed của YouTube vẫn có thể xuất hiện. Phần giao diện của Occra thì không có quảng cáo.
- Video phải luôn hiển thị (ảnh bìa vuông chính là video được cắt), vì điều khoản embed của YouTube không cho ẩn hay tách riêng phần âm thanh.