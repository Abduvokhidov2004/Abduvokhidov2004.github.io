// Сервис-воркер для PWA приложения генератора QR-кодов

const CACHE_NAME = "qr-code-generator-v1"
const urlsToCache = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/app.js",
  "/manifest.json",
  "https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js",
]

// Установка - кэширование ресурсов
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Кэш открыт")
      return cache.addAll(urlsToCache)
    }),
  )
})

// Активация - очистка старых кэшей
self.addEventListener("activate", (event) => {
  const cacheWhitelist = [CACHE_NAME]
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName)
          }
        }),
      )
    }),
  )
})

// Fetch - обслуживание из кэша, если доступно, иначе из сети
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Найдено в кэше - возвращаем ответ
      if (response) {
        return response
      }
      return fetch(event.request).then((response) => {
        // Проверяем, получили ли мы валидный ответ
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response
        }

        // Клонируем ответ
        const responseToCache = response.clone()

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache)
        })

        return response
      })
    }),
  )
})
