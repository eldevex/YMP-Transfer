document.getElementById('startBtn').addEventListener('click', async () => {
  const playlistNameInput = document.getElementById('playlistName');
  const startBtn = document.getElementById('startBtn');
  const statusDiv = document.getElementById('status');

  const playlistName = playlistNameInput.value.trim();
  if (!playlistName) {
    statusDiv.textContent = 'Ошибка: Введите название плейлиста.';
    return;
  }

  startBtn.disabled = true;
  statusDiv.textContent = 'Запуск...';

  try {
    // Получаем активную вкладку
    // Заменяем chrome на browser
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('music.yandex.ru/')) {
      statusDiv.textContent = 'Ошибка: Не на странице Яндекс.Музыки!';
      return;
    }

    statusDiv.textContent = 'Анализ страницы...';

    // --- НАЧАЛО ИЗМЕНЕНИЯ ---
    // Подготовим код функции как строку
    const functionCode = processTracksIncrementally.toString();

    // Выполняем основной скрипт на странице
    // Заменяем chrome.scripting на browser.tabs
    // browser.tabs.executeScript возвращает результат напрямую
    let result;
    try {
      // browser.tabs.executeScript возвращает Promise, который разрешается массивом результатов
      // для каждой вкладки. Так как мы указали одну вкладку (tab.id), массив будет содержать один элемент.
      // Передаём код функции как строку и аргументы отдельно.
      [result] = await browser.tabs.executeScript(tab.id, {
        code: `(${functionCode})(${JSON.stringify(playlistName)})` // Передаём имя плейлиста как аргумент
      });
    } catch (err) {
      statusDiv.textContent = `Ошибка выполнения скрипта: ${err.message}`;
      return; // Выходим из обработчика
    }
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---

    if (result.success) {
      statusDiv.textContent = `Готово: ${result.processed} треков обработано. Ошибок: ${result.errorCount}.`;
    } else {
      statusDiv.textContent = `Ошибка: ${result.message}`;
    }
  } catch (err) {
    statusDiv.textContent = `Ошибка: ${err.message}`;
  } finally {
    startBtn.disabled = false;
  }
});

// --- ЭТА ФУНКЦИЯ ОСТАЁТСЯ БЕЗ ИЗМЕНЕНИЙ ---
// Функция, которая обрабатывает треки, прокручивая страницу после каждой обработки
// Не проверяет появление новых элементов, просто прокручивает и ищет необработанные
// Эта функция будет выполнена на странице Яндекс.Музыки и должна быть полностью самодостаточной
function processTracksIncrementally(targetPlaylistName) {
  return new Promise((resolve) => {
    console.log('Начинаю обработку треков, прокручивая после каждой обработки (без проверки новых)...');
    const processedTrackIds = new Set(); // Множество для отслеживания уже обработанных треков
    let processedCount = 0;
    let errorCount = 0;
    let attempts = 0;
    const maxAttempts = 20; // Максимум попыток без нахождения *необработанных* треков
    // Уменьшены задержки
    const scrollDelay = 600;  // Было 1200, стало 600
    const processDelay = 1800; // Было 3500, стало 1800

    // Попробуем использовать уникальный атрибут для идентификации трека
    function getTrackId(element) {
        // Попробуем найти уникальный идентификатор внутри элемента трека
        // Например, ссылка на трек в атрибуте href
        const trackLink = element.querySelector('a[href*="/album/"][href*="/track/"]');
        if (trackLink) {
            return trackLink.getAttribute('href');
        }
        // Или артист + название (менее надёжно, но может помочь)
        const titleElement = element.querySelector('.Meta_title__GGBnH');
        const artistElement = element.querySelector('.Meta_artistCaption__JESZi');
        if (titleElement && artistElement) {
            return `${artistElement.textContent.trim()} - ${titleElement.textContent.trim()}`;
        }
        // Fallback: используем data-index, если есть
        const dataIndex = element.getAttribute('data-index');
        if (dataIndex !== null) {
            return `index_${dataIndex}`;
        }
        // Если ничего не нашли, используем порядковый номер в DOM (наименее надёжный способ)
        const allTracks = document.querySelectorAll('.CommonTrack_root__i6shE');
        return `dom_index_${Array.from(allTracks).indexOf(element)}`;
    }

    function processTrackElement(element) {
        return new Promise((procResolve) => {
            const trackId = getTrackId(element);
            if (processedTrackIds.has(trackId)) {
                console.log(`Трек с ID ${trackId} уже был обработан. Пропускаю.`);
                procResolve();
                return;
            }

            // Добавляем ID в множество обработанных
            processedTrackIds.add(trackId);

            console.log(`Обработка трека с ID: ${trackId}`);

            // Найдем кнопку "Контекстное меню"
            const menuButton = element.querySelector('button[aria-label="Контекстное меню"].CommonControlsBar_contextMenu__EAq_c');
            if (!menuButton) {
                console.warn(`Кнопка меню не найдена для трека с ID ${trackId}`);
                errorCount++;
                procResolve();
                return;
            }

            // Прокрутим элемент в видимую область и кликнем по меню
            menuButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            menuButton.click();

            // Ждем, пока откроется меню
            setTimeout(() => {
                // Найдем пункт "Добавить в плейлист"
                const addToListItem = Array.from(document.querySelectorAll('[role="menuitem"], .Menu__item, button'))
                    .find(item => (item.textContent || '').trim().toLowerCase().includes('добавить в плейлист'));

                if (!addToListItem) {
                    console.warn(`Пункт "Добавить в плейлист" не найден для трека с ID ${trackId}`);
                    errorCount++;
                    // Закрываем меню
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                    procResolve();
                    return;
                }

                addToListItem.click();

                // Ждем, пока откроется список плейлистов
                setTimeout(() => {
                    // Найдем *все* элементы плейлистов (role="menuitem", .Menu__item, button)
                    const playlistItems = Array.from(document.querySelectorAll('[role="menuitem"], .Menu__item, button'));

                    // Найдем элемент, соответствующий целевому плейлисту
                    const targetPlaylistItem = playlistItems.find(item => (item.textContent || '').trim().toLowerCase() === targetPlaylistName.toLowerCase());

                    if (targetPlaylistItem) {
                        // --- НОВАЯ ЛОГИКА: Проверка, добавлена ли уже ---
                        const checkIcon = targetPlaylistItem.querySelector('svg use[xlink\\:href="/icons/sprite.svg#check_xxs"], svg[aria-label="Уже есть в этом плейлисте"]');
                        const isAdded = !!checkIcon;

                        if (isAdded) {
                            console.log(`Трек с ID ${trackId} уже добавлен в '${targetPlaylistName}'. Пропускаю.`);
                            processedCount++; // Считаем как обработанный
                            // Закрываем меню
                            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                            procResolve();
                            return;
                        }
                        // --- КОНЕЦ НОВОЙ ЛОГИКИ ---

                        // Если не добавлен, кликаем
                        targetPlaylistItem.click();
                        console.log(`Трек с ID ${trackId} добавлен в '${targetPlaylistName}'.`);
                        processedCount++;
                    } else {
                        // --- ИЗМЕНЕНИЕ: Убрана логика создания, добавлена ошибка и остановка ---
                        console.error(`Плейлист '${targetPlaylistName}' не найден в меню для трека с ID ${trackId}. Прекращаю выполнение.`);
                        errorCount++; // Увеличиваем счётчик ошибок

                        // Если это первый трек (по счёту обработки), завершаем всё выполнение
                        // Проверим, пустое ли множество обработанных треков
                        if (processedTrackIds.size === 1) { // Только что добавленный
                             console.log(`Остановка скрипта после обнаружения отсутствия плейлиста на первом обрабатываемом треке.`);
                             // Закрываем меню
                             document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                             // Разрешаем основной промис с ошибкой
                             resolve({ success: false, message: `Плейлист '${targetPlaylistName}' не найден в меню при обработке первого трека. Выполнение остановлено.` });
                             return; // Выходим из processTrackElement, чтобы не вызывать procResolve
                        }

                        // Если это НЕ первый трек, просто пропускаем и переходим к следующему
                        console.log(`Пропускаю трек с ID ${trackId} из-за отсутствия плейлиста.`);
                        // Закрываем меню
                        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                        procResolve(); // Переходим к следующему действию
                        return;
                        // --- КОНЕЦ ИЗМЕНЕНИЯ ---
                    }

                    // Задержка перед обработкой следующего трека (уменьшена)
                    setTimeout(procResolve, processDelay);
                }, 800); // Было 1500, стало 800
            }, 500); // Было 1000, стало 500
        });
    }

    // Функция, которая находит *необработанные* треки из *всех* текущих
    function findUnprocessedTracks() {
        const allTracks = document.querySelectorAll('.CommonTrack_root__i6shE');
        const unprocessedTracks = [];

        allTracks.forEach(trackElement => {
            const id = getTrackId(trackElement);
            if (!processedTrackIds.has(id)) {
                unprocessedTracks.push(trackElement);
            }
        });

        return unprocessedTracks;
    }

    // Основная рекурсивная функция для прокрутки и обработки
    function scrollAndProcess() {
        // Найдём необработанные треки среди *всех* текущих
        const unprocessedTracks = findUnprocessedTracks();

        if (unprocessedTracks.length > 0) {
            console.log(`Найдено ${unprocessedTracks.length} необработанных треков. Обрабатываю первый...`);
            // Сбросим счётчик попыток, так как нашли необработанный трек
            attempts = 0;

            // Обработаем первый из необработанных треков
            const trackToProcess = unprocessedTracks[0];
            processTrackElement(trackToProcess).then(() => {
                // После обработки одного трека, прокрутим страницу
                console.log('Прокручиваю страницу после обработки трека...');
                window.scrollBy(0, window.innerHeight * 0.8); // Прокрутка на 80% высоты экрана

                // Подождём немного, чтобы UI мог отреагировать (уменьшено)
                setTimeout(() => {
                    // Вызовем себя снова для поиска и обработки следующего
                    scrollAndProcess();
                }, scrollDelay);
            });
        } else {
            // Необработанных треков нет *среди текущих*
            attempts++;
            if (attempts >= maxAttempts) {
                console.log(`Достигнуто максимальное количество попыток (${maxAttempts}) без нахождения необработанных треков. Завершаем.`);
                resolve({ success: true, processed: processedCount, errorCount: errorCount });
            } else {
                console.log(`Попытка ${attempts}/${maxAttempts}. Необработанных треков не найдено. Прокручиваю дальше...`);
                // Прокрутим ещё немного, может, появятся новые элементы или просто сдвинем вирт. список
                window.scrollBy(0, window.innerHeight * 0.8);
                setTimeout(() => {
                    scrollAndProcess(); // Проверим снова после прокрутки
                }, scrollDelay);
            }
        }
    }

    // НАЧАЛО ВЫПОЛНЕНИЯ
    // Найдём первый трек сразу и обработаем его, не прокручивая
    const initialTracks = findUnprocessedTracks();
    if (initialTracks.length > 0) {
        console.log('Обрабатываю первый трек без предварительной прокрутки...');
        const firstTrack = initialTracks[0];
        processTrackElement(firstTrack).then(() => {
            console.log('Первый трек обработан. Начинаю прокрутку и обработку остальных...');
            // После обработки первого трека, запускаем основной цикл прокрутки
            scrollAndProcess();
        });
    } else {
        console.log('Не найдено необработанных треков при старте. Начинаю прокрутку...');
        // Если нет треков при старте, сразу начинаем прокручивать
        scrollAndProcess();
    }
  });
}