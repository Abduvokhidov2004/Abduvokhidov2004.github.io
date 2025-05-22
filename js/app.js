// Регистрация сервис-воркера
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("Сервис-воркер зарегистрирован:", registration.scope)
      })
      .catch((error) => {
        console.error("Ошибка регистрации сервис-воркера:", error)
      })
  })
}

// Получаем элементы DOM
const textInput = document.getElementById("text-input")
const clearButton = document.getElementById("clear-button")
const qrContainer = document.getElementById("qr-container")
const sizeSlider = document.getElementById("size-slider")
const sizeValue = document.getElementById("size-value")
const downloadButton = document.getElementById("download-button")

// Функция для генерации QR-кода
function generateQRCode() {
  const text = textInput.value || " "
  const size = Number.parseInt(sizeSlider.value)

  // Очищаем контейнер
  qrContainer.innerHTML = ""

  // Создаем QR-код
  QRCode.toCanvas(
    document.createElement("canvas"),
    text,
    {
      width: size,
      margin: 1,
      errorCorrectionLevel: "H",
    },
    (error, canvas) => {
      if (error) {
        console.error(error)
        return
      }
      qrContainer.appendChild(canvas)
    },
  )
}

// Функция для скачивания QR-кода
function downloadQRCode() {
  const canvas = qrContainer.querySelector("canvas")
  if (!canvas) return

  const pngUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream")

  const downloadLink = document.createElement("a")
  downloadLink.href = pngUrl
  downloadLink.download = "qrcode.png"
  document.body.appendChild(downloadLink)
  downloadLink.click()
  document.body.removeChild(downloadLink)
}

// Обработчики событий
textInput.addEventListener("input", generateQRCode)

clearButton.addEventListener("click", () => {
  textInput.value = ""
  generateQRCode()
})

sizeSlider.addEventListener("input", () => {
  sizeValue.textContent = sizeSlider.value
  generateQRCode()
})

downloadButton.addEventListener("click", downloadQRCode)

// Генерируем QR-код при загрузке страницы
window.addEventListener("load", generateQRCode)
