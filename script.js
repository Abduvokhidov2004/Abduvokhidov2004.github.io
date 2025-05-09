// Данные о фильмах
const movies = [
    {
      id: 1,
      title: "Дэдпул и Росомаха",
      poster: "https://avatars.mds.yandex.net/get-kinopoisk-image/10592371/35df2d41-69ee-42d2-a029-41fa52b03cc7/600x900",
      genre: "Фантастика, боевик, комедия, приключения",
      director: "Шон Леви",
      cast: "Райан Рейнольдс, Хью Джекман, Эмма Корин, Морена Баккарин",
      ageRating: "18+",
      duration: " 128 мин.",
      description:
        "Уэйд Уилсон попадает в организацию «Управление временными изменениями», что вынуждает его вернуться к своему альтер-эго Дэдпулу и изменить историю с помощью Росомахи.",
      trailerUrl: "https://vk.com/video-145404816_456245649",
      videoSource: "rutube",
    },
    {
      id: 2,
      title: "Дикий робот",
      poster: "https://www.kino-teatr.ru/movie/posters/big/6/0/181306.jpg",
      genre: "Мультфильм, семейный, фантастика, приключения",
      director: "Крис Сандерс",
      cast: "Лупита Нионго, Педро Паскаль, Кит Коннор, Билл Найи",
      ageRating: "12+",
      duration: "102 мин.",
      description:
        "Посылка с роботом-помощником ROZZUM 7134 падает на необитаемый остров. Тщетно пытаясь найти задания, которые можно выполнить, робот выучивает язык животных и по наставлению опытной мамы-опоссума начинает заботиться о крохотном гусёнке, чью семью он случайно раздавил. В консультанты к нему набивается «специалист по гусям» хитрый лис Финк, с которым никто не хочет дружить.",
      trailerUrl: "https://vk.com/video-220018529_456242408", // Пример ссылки на VK видео
      videoSource: "vk",
    },
    {
      id: 3,
      title: "Веном: Последний танец ",
      poster:
        "https://avatars.mds.yandex.net/get-kinopoisk-image/10703859/d8a5b34e-321c-4881-a14a-f75dc549cbea/220x330",
      genre: "Фантастика, боевик, ужасы",
      director: "Келли Марсел",
      cast: "Том Харди, Джуно Темпл, Чивитель Эджиофор",
      ageRating: "16+",
      duration: "110 мин",
      description:
        "Приспособившись к совместному существованию, Эдди и Веном стали друзьями и вместе сражаются со злодеями. Но теперь за Эдди охотятся военные, а за Веномом — его инопланетные сородичи, угрожающие всему живому.",
      trailerUrl: "https://vk.com/video-32370614_456270978",
      videoSource: "vk",
    },
  ]
  
  // Функция для преобразования URL видео в формат для встраивания
  function getEmbedUrl(url, source) {
    if (!url) return null
  
    // Обработка YouTube URL
    if (source === "youtube" || url.includes("youtube.com") || url.includes("youtu.be")) {
      // Если URL уже в формате embed, используем его
      if (url.includes("/embed/")) {
        return url + (url.includes("?") ? "&autoplay=1" : "?autoplay=1")
      }
  
      // Извлекаем ID видео из YouTube URL
      let videoId = ""
      if (url.includes("youtu.be/")) {
        videoId = url.split("youtu.be/")[1]
      } else if (url.includes("v=")) {
        videoId = url.split("v=")[1].split("&")[0]
      }
  
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}?autoplay=1`
      }
    }
  
    // Обработка VK URL
    if (source === "vk" || url.includes("vk.com/video")) {
      // Регулярное выражение для извлечения ID владельца и ID видео из VK URL
      const vkRegex = /vk\.com\/video(-?\d+)_(\d+)/
      const match = url.match(vkRegex)
  
      if (match && match.length >= 3) {
        const ownerId = match[1]
        const videoId = match[2]
        return `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hd=1&autoplay=1`
      }
    }
  
    // Если не удалось обработать URL, возвращаем исходный
    return url
  }
  
  // Функция для отображения информации о фильме
  function displayMovieInfo(movie) {
    const movieInfoContainer = document.getElementById("movie-info")
  
    // Создаем HTML для информации о фильме
    const movieHTML = `
          <div class="movie-content">
              <div class="movie-poster">
                  <img src="${movie.poster}" alt="Постер фильма ${movie.title}">
              </div>
              <div class="movie-details">
                  <h2 class="movie-title">${movie.title}</h2>
                  
                  <div class="movie-info-list">
                      <div class="movie-info-item">
                          <span class="movie-info-label">Жанр:</span>
                          <span>${movie.genre || "—"}</span>
                      </div>
                      <div class="movie-info-item">
                          <span class="movie-info-label">Режиссер:</span>
                          <span>${movie.director || "—"}</span>
                      </div>
                      <div class="movie-info-item">
                          <span class="movie-info-label">В ролях:</span>
                          <span>${movie.cast || "—"}</span>
                      </div>
                      <div class="movie-info-item">
                          <span class="movie-info-label">Возраст:</span>
                          <span>${movie.ageRating || "—"}</span>
                      </div>
                      <div class="movie-info-item">
                          <span class="movie-info-label">Длительность:</span>
                          <span>${movie.duration || "—"}</span>
                      </div>
                  </div>
                  
                  <button class="buy-ticket-btn">КУПИТЬ БИЛЕТ</button>
                  
                  <div class="movie-description-container">
                      <h3 class="movie-description-title">Описание</h3>
                      <p class="movie-description">${movie.description}</p>
                  </div>
              </div>
          </div>
          
          <div class="trailer-section">
              <h3 class="trailer-title">Трейлер</h3>
              <div class="trailer-container">
                  <div class="trailer-placeholder" id="trailer-placeholder" data-source="${movie.videoSource || "youtube"}" data-url="${movie.trailerUrl}">
                      <div class="play-button">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5 3 19 12 5 21 5 3"></polygon>
                          </svg>
                      </div>
                      <img src="${movie.poster}" alt="Трейлер фильма ${movie.title}">
                  </div>
              </div>
          </div>
      `
  
    // Вставляем HTML в контейнер
    movieInfoContainer.innerHTML = movieHTML
  
    // Добавляем обработчик события для воспроизведения трейлера
    const trailerPlaceholder = document.getElementById("trailer-placeholder")
    trailerPlaceholder.addEventListener("click", function () {
      const trailerContainer = this.parentElement
      const videoUrl = this.getAttribute("data-url")
      const videoSource = this.getAttribute("data-source")
  
      // Получаем URL для встраивания
      const embedUrl = getEmbedUrl(videoUrl, videoSource)
  
      if (!embedUrl) {
        console.error("Не удалось получить URL для встраивания видео")
        return
      }
  
      this.remove()
  
      const iframe = document.createElement("iframe")
      iframe.src = embedUrl
      iframe.title = `Трейлер фильма`
      iframe.frameBorder = "0"
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      iframe.allowFullscreen = true
      iframe.className = "trailer-iframe"
  
      trailerContainer.appendChild(iframe)
    })
  }
  
  // Выбираем случайный фильм при загрузке страницы
  document.addEventListener("DOMContentLoaded", () => {
    const randomIndex = Math.floor(Math.random() * movies.length)
    const randomMovie = movies[randomIndex]
    displayMovieInfo(randomMovie)
  })
  