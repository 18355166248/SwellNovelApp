# 业务图片压缩与 CDN 上传记录

> 日期：2026-09-01
> 范围：`src/assets` 下 25 张运行时业务图片
> 压缩：TinyPNG（已获用户授权）
> CDN：喜马拉雅测试 CDN

## 结果

- 25/25 张压缩并上传成功。
- 总体积由 4,524,693 B 降至 2,153,015 B，减少 2,371,678 B（52.42%）。
- CDN 返回地址支持 HTTPS；清单统一记录为 HTTPS。
- 当前客户端继续使用压缩后的本地资源，保留离线可用性。下列地址属于 `audiopaytest` 测试域名，不应在没有正式域名和发布策略确认时直接替换生产资源。

## CDN 映射

| 本地资源 | CDN 地址 |
| --- | --- |
| `src/assets/reader-backgrounds/bamboo-corner-v1.png` | https://audiopaytest.cos.tx.xmcdn.com/storages/3a19-audiotest/02/04/GAqSoUUObDLLAAD3nQACE9zx.png |
| `src/assets/reader-backgrounds/bamboo-wall-v4.jpg` | https://audiopaytest.cos.tx.xmcdn.com/storages/da95-audiotest/81/E0/GAqSpGcObDLMAAH_TQACE9zy.jpg |
| `src/assets/reader-backgrounds/lake-ripple.jpg` | https://audiopaytest.cos.tx.xmcdn.com/storages/71a9-audiotest/8A/E1/GAqSoUUObDLMAAEh7gACE9zz.jpg |
| `src/assets/reader-backgrounds/sunset-river-v1.png` | https://audiopaytest.cos.tx.xmcdn.com/storages/1f1b-audiotest/AE/FB/GAqSpGcObDLMAAFn5AACE9z0.png |
| `src/assets/reader-backgrounds/river-sunset-v4.jpg` | https://audiopaytest.cos.tx.xmcdn.com/storages/85dd-audiotest/E1/A6/GAqSoUUObDLNAAF0DgACE9z1.jpg |
| `src/assets/reader-backgrounds/cosmic-night-v1.jpg` | https://audiopaytest.cos.tx.xmcdn.com/storages/8126-audiotest/E6/DF/GAqSpGcObDLNAAC1ygACE9z2.jpg |
| `src/assets/profile/frames/frame-01.png` | https://audiopaytest.cos.tx.xmcdn.com/storages/3826-audiotest/11/85/GAqSoUUObDLOAABHBgACE9z5.png |
| `src/assets/profile/frames/frame-02.png` | https://audiopaytest.cos.tx.xmcdn.com/storages/0d6b-audiotest/34/7D/GAqSpGcObDLOAABi0wACE9z4.png |
| `src/assets/profile/frames/frame-03.png` | https://audiopaytest.cos.tx.xmcdn.com/storages/2052-audiotest/22/0C/GAqSoUUObDLNAAB95QACE9z3.png |
| `src/assets/profile/frames/frame-04.png` | https://audiopaytest.cos.tx.xmcdn.com/storages/82af-audiotest/74/F0/GAqSoUUObDLSAABfrAACE9z7.png |
| `src/assets/profile/frames/frame-05.png` | https://audiopaytest.cos.tx.xmcdn.com/storages/fe01-audiotest/8E/C1/GAqSpGcObDLSAABZqwACE9z6.png |
| `src/assets/profile/frames/frame-06.png` | https://audiopaytest.cos.tx.xmcdn.com/storages/9647-audiotest/2D/75/GAqSpGcObDLTAABsJgACE9z8.png |
| `src/assets/profile/avatars/avatar-01.png` | https://audiopaytest.cos.tx.xmcdn.com/storages/0af9-audiotest/0F/33/GAqSpGcObDLUAAFqjwACE90A.png |
| `src/assets/profile/avatars/avatar-02.png` | https://audiopaytest.cos.tx.xmcdn.com/storages/42e6-audiotest/6B/7F/GAqSpGcObDLVAAEfVQACE90C.png |
| `src/assets/profile/avatars/avatar-03.png` | https://audiopaytest.cos.tx.xmcdn.com/storages/62b7-audiotest/21/EA/GAqSoUUObDLUAAFBrgACE90B.png |
| `src/assets/profile/avatars/avatar-04.png` | https://audiopaytest.cos.tx.xmcdn.com/storages/25c4-audiotest/0F/FF/GAqSoUUObDLUAAFrUgACE9z_.png |
| `src/assets/profile/avatars/avatar-05.png` | https://audiopaytest.cos.tx.xmcdn.com/storages/2dce-audiotest/9C/47/GAqSpGcObDLTAAEgwAACE9z-.png |
| `src/assets/profile/avatars/avatar-06.png` | https://audiopaytest.cos.tx.xmcdn.com/storages/e099-audiotest/3B/D4/GAqSoUUObDLTAAFdFgACE9z9.png |
| `src/assets/profile/profile-card-background.png` | https://audiopaytest.cos.tx.xmcdn.com/storages/dc1f-audiotest/D5/C2/GAqSoUUObDLVAAIo2AACE90D.png |
| `src/assets/book-covers/cover-botanical.jpg` | https://audiopaytest.cos.tx.xmcdn.com/storages/855d-audiotest/A8/6B/GAqSpGcObDLVAAIz7wACE90E.jpg |
| `src/assets/book-covers/cover-night-boat.jpg` | https://audiopaytest.cos.tx.xmcdn.com/storages/ff97-audiotest/EE/0A/GAqSoUUObDLWAAEI-QACE90F.jpg |
| `src/assets/book-covers/cover-lychee.jpg` | https://audiopaytest.cos.tx.xmcdn.com/storages/ad61-audiotest/97/C9/GAqSpGcObDLWAAJvYgACE90G.jpg |
| `src/assets/book-covers/cover-blue-alley.jpg` | https://audiopaytest.cos.tx.xmcdn.com/storages/1c24-audiotest/2F/33/GAqSoUUObDLXAAKr2AACE90H.jpg |
| `src/assets/book-covers/cover-sunset-courtyard.jpg` | https://audiopaytest.cos.tx.xmcdn.com/storages/9059-audiotest/47/57/GAqSpGcObDLXAAJV-QACE90I.jpg |
| `src/assets/book-covers/cover-bookshop.jpg` | https://audiopaytest.cos.tx.xmcdn.com/storages/ea36-audiotest/9C/9F/GAqSoUUObDLXAAJWuwACE90J.jpg |

App 图标属于原生安装包资源，不能依赖 CDN；审计截图不是运行时资源，因此均未纳入本次上传。
