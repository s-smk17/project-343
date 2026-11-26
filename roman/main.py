import asyncio
import math
import os
from urllib.parse import quote

import flet as ft
import flet_audio as fta
import flet_geolocator as ftg
import flet_map as ftm

# Для мобильной сборки ключ можно указать вторым аргументом getenv.
YANDEX_TILES_API_KEY = os.getenv("YANDEX_TILES_API_KEY", "").strip()

ROUTE_343E = [
    {"name": "Станция метро Проспект Ветеранов", "lat": 59.841925, "lon": 30.251472},
    {"name": "Улица Солдата Корзуна", "lat": 59.833626, "lon": 30.217203},
    {"name": "Проспект Маршала Жукова", "lat": 59.833122, "lon": 30.196659},
    {"name": "Авангардная улица", "lat": 59.833096, "lon": 30.181858},
    {"name": "Улица Пограничника Гарькавого", "lat": 59.835494, "lon": 30.146030},
    {"name": "Улица Пионерстроя", "lat": 59.835505, "lon": 30.128085},
    {"name": "Рогачёвский переулок", "lat": 59.841970, "lon": 30.130531},
    {"name": "Проспект Будённого", "lat": 59.852752, "lon": 30.089369, "audio": "audio/08.mp3"},
    {"name": "Константиновский дворец", "lat": 59.851541, "lon": 30.058099, "audio": "audio/08.5.mp3"},
    {"name": "Фронтовая улица", "lat": 59.852910, "lon": 30.036047, "audio": "audio/09.mp3"},
    {"name": "Кропоткинская улица", "lat": 59.854896, "lon": 30.020567},
    {"name": "Улица Крылова", "lat": 59.858147, "lon": 30.004907},
    {"name": "Константиновская улица – Николаевская больница", "lat": 59.878519, "lon": 29.920103, "audio": "audio/12.mp3"},
    {"name": "Фонтаны", "lat": 59.880442, "lon": 29.906564, "audio": "audio/12.5.mp3"},
    {"name": "Разводная улица", "lat": 59.880977, "lon": 29.902956, "audio": "audio/13.mp3"},
    {"name": "Фабричная улица", "lat": 59.883181, "lon": 29.889367, "audio": "audio/14.mp3"},
    {"name": "Посёлок Просвещения", "lat": 59.894253, "lon": 29.861075, "audio": "audio/15.mp3"},
    {"name": "Мордвиновка", "lat": 59.899376, "lon": 29.827707, "audio": "audio/16.mp3"},
    {"name": "Новогорская улица", "lat": 59.899998, "lon": 29.814455, "audio": "audio/17.mp3"},
    {"name": "Улица Связи", "lat": 59.897904, "lon": 29.807719, "audio": "audio/18.mp3"},
    {"name": "Улица Федюнинского", "lat": 59.894654, "lon": 29.796321, "audio": "audio/19.mp3"},
    {"name": "Ораниенбаумский проспект / Улица Федюнинского, 31", "lat": 59.900046, "lon": 29.777662, "audio": "audio/20.mp3"},
    {"name": "Улица Федюнинского / Улица Победы", "lat": 59.903017, "lon": 29.770512, "audio": "audio/21.mp3"},
    {"name": "Швейцарская улица / Улица Победы", "lat": 59.906088, "lon": 29.772622, "audio": "audio/22.mp3"},
    {"name": "Красноармейская улица", "lat": 59.907723, "lon": 29.774272},
    {"name": "Александровская улица", "lat": 59.909975, "lon": 29.774892},
    {"name": "Ломоносов – Владимирская улица", "lat": 59.910435, "lon": 29.769417, "audio": "audio/25.mp3"},
    {"name": "Ломоносовская межрайонная больница", "lat": 59.913697, "lon": 29.767054, "audio": "audio/26.mp3"},
    {"name": "Ломоносов – Вокзал", "lat": 59.917927, "lon": 29.767671, "audio": "audio/27.mp3"},
]
STOPS_343E = [point for point in ROUTE_343E if "audio" in point]

TRIGGER_RADIUS_M = 20
DEFAULT_AUDIO_VOLUME = 1.0
APP_VERSION = "1.1.0"

def haversine(lat1, lon1, lat2, lon2):
    """Расстояние в метрах между двумя точками."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

async def main(page: ft.Page):
    page.title = "343Э — Аудиогид"
    page.padding = 0
    page.theme_mode = ft.ThemeMode.LIGHT
    page.theme = ft.Theme(color_scheme_seed=ft.Colors.BLUE)
    page.dark_theme = ft.Theme(color_scheme_seed=ft.Colors.BLUE)
    prefs = ft.SharedPreferences()

    geo = ftg.Geolocator()
    page.services.append(geo)

    status_text = ft.Text("Экскурсия не запущена", size=13)
    last_stop_text = ft.Text("Последняя остановка: —", size=13, color=ft.Colors.GREY)
    content_host = ft.Container(expand=True, padding=16)
    audio_players = {}
    audio_buttons = {}
    audio_progress_bars = {}
    audio_time_labels = {}

    trigger_radius_m = TRIGGER_RADIUS_M
    audio_volume = DEFAULT_AUDIO_VOLUME
    settings_controls = {}

    # Сначала создаём словари
    audio_positions_ms = {
        stop["name"]: 0 for stop in STOPS_343E
    }

    audio_durations_ms = {
        stop["name"]: 0 for stop in STOPS_343E
    }

    audio_is_seeking = {
        stop["name"]: False for stop in STOPS_343E
    }

    # Теперь загружаем сохранённые позиции
    for stop in STOPS_343E:
        key = f"audio_guide_343e.position.{stop['name']}"

        saved_position = await prefs.get(key)

        if saved_position is not None:
            try:
                audio_positions_ms[stop["name"]] = max(
                    0, int(saved_position)
                )
            except (TypeError, ValueError):
                audio_positions_ms[stop["name"]] = 0

    async def save_audio_progress(name, position_ms):
        key = f"audio_guide_343e.position.{name}"

        try:
            await prefs.set(
                key,
                max(0, int(position_ms))
            )
        except Exception as exc:
            print("ОШИБКА СОХРАНЕНИЯ ПРОГРЕССА:", repr(exc))

    def format_audio_time(milliseconds):
        seconds = max(0, int(milliseconds / 1000))
        minutes = seconds // 60
        seconds = seconds % 60
        return f"{minutes:02d}:{seconds:02d}"

    def refresh_audio_progress(name):
        progress_bar = audio_progress_bars.get(name)
        time_label = audio_time_labels.get(name)

        if progress_bar is None or time_label is None:
            return

        position = audio_positions_ms[name]
        duration = audio_durations_ms[name]
        progress_bar.max = max(duration, 1)

        if not audio_is_seeking[name]:
            progress_bar.value = (
                min(position, duration) if duration > 0 else 0
            )

        total_text = (
            format_audio_time(duration)
            if duration > 0 else "--:--"
        )

        time_label.value = (
            f"{format_audio_time(position)} / {total_text}"
        )

        page.update()

    def start_audio_seek(name, e):
        audio_is_seeking[name] = True

    def preview_audio_seek(name, e):
        target = int(e.control.value)
        duration = audio_durations_ms[name]

        audio_time_labels[name].value = (
            f"{format_audio_time(target)} / "
            f"{format_audio_time(duration)}"
        )
        page.update()

    async def seek_audio(name, target_ms):
        if current_stop_name != name:
            audio_is_seeking[name] = False
            refresh_audio_progress(name)
            return

        duration = audio_durations_ms[name]
        target_ms = max(0, min(int(target_ms), duration))

        try:
            audio = audio_players[name]

            await audio.seek(
                ft.Duration(milliseconds=target_ms)
            )

            audio_positions_ms[name] = target_ms
            await save_audio_progress(name, target_ms)

        except Exception as exc:
            print("ОШИБКА ПЕРЕМОТКИ:", repr(exc))
            show_error(f"Не удалось перемотать запись: {exc}")

        finally:
            audio_is_seeking[name] = False
            refresh_audio_progress(name)

    def handle_audio_position(name, e):
        if current_stop_name != name:
            return

        position = int(e.position)

        if (
            not audio_is_seeking[name]
            and position < audio_positions_ms[name]
        ):
            return

        audio_positions_ms[name] = position

        if not audio_is_seeking[name]:
            refresh_audio_progress(name)

            page.run_task(
                save_audio_progress,
                name,
                position,
            )

        if name in audio_progress_bars:
            audio_progress_bars[name].disabled = (
                name != current_stop_name
                or audio_durations_ms[name] <= 0
            )
    def handle_audio_duration(name, e):
        audio_durations_ms[name] = int(
            e.duration.in_milliseconds
        )

        refresh_audio_progress(name)

        if name in audio_progress_bars:
            audio_progress_bars[name].disabled = (
                name != current_stop_name
                or audio_durations_ms[name] <= 0
            )
    # Создаём аудиоплееры при запуске приложения
    for stop in STOPS_343E:
        audio = fta.Audio(
            src=stop["audio"],
            autoplay=False,
            volume=audio_volume,
            release_mode=fta.ReleaseMode.STOP,
            on_position_change=lambda e, name=stop["name"]: handle_audio_position(name, e),
            on_duration_change=lambda e, name=stop["name"]: handle_audio_duration(name, e),
        )
        page.services.append(audio)
        audio_players[stop["name"]] = audio
    audio_paused = False
    audio_lock = asyncio.Lock()
    triggered = {stop["name"]: False for stop in STOPS_343E}
    smooth_lat = None
    smooth_lon = None
    tracking_task = None
    current_audio = None
    current_stop_name = None
    selected_screen = 0

    def show_error(message):
        # Короткое всплывающее уведомление только для реальных ошибок.
        page.show_dialog(
            ft.SnackBar(
                content=ft.Text(message),
                bgcolor=ft.Colors.RED_700,
                duration=5000,
                show_close_icon=True,
            )
        )

    def log_info(message):
        # Без постоянного журнала на экране: обычный статус обновляется тихо.
        status_text.value = message
        page.update()

    stop_markers = [
        ftm.Marker(
            coordinates=ftm.MapLatitudeLongitude(
                latitude=stop["lat"], longitude=stop["lon"]
            ),
            content=ft.Container(
                content=ft.Text(stop["name"], size=10, weight=ft.FontWeight.W_500),
                bgcolor=ft.Colors.with_opacity(0.88, ft.Colors.SURFACE),
                padding=5,
                border_radius=8,
            ),
            width=120,
            height=34,
        )
        for stop in ROUTE_343E
    ]

    current_marker = ftm.Marker(
        coordinates=ftm.MapLatitudeLongitude(latitude=59.908, longitude=29.778),
        content=ft.Icon(ft.Icons.NAVIGATION, color=ft.Colors.BLUE, size=32),
        height=40,
    )
    follow_bus = False

    def on_map_position_change(e):
        nonlocal follow_bus

        # Если пользователь сам передвинул карту — отключаем слежение.
        if e.has_gesture and follow_bus:
            follow_bus = False

            if follow_button is not None:
                follow_button.icon_color = ft.Colors.GREY
                page.update()
    map_control = ftm.Map(
        on_position_change=on_map_position_change,
        expand=True,
        interaction_configuration=ftm.InteractionConfiguration(
            flags=ftm.InteractionFlag.ALL
        ),
        initial_center=ftm.MapLatitudeLongitude(latitude=59.908, longitude=29.778),
        initial_zoom=12,
        max_zoom=20,
        layers=[
            ftm.TileLayer(
                url_template=(
                    "https://tiles.api-maps.yandex.ru/v1/tiles/"
                    "?x={x}&y={y}&z={z}&lang=ru_RU&l=map"
                    "&projection=web_mercator"
                    f"&apikey={quote(YANDEX_TILES_API_KEY, safe='')}"
                ),
                max_native_zoom=20,
                user_agent_package_name="audio-guide-343e",
            ),
            ftm.MarkerLayer(markers=stop_markers + [current_marker]),
        ],
    )
   
    follow_button = ft.IconButton(
        icon=ft.Icons.MY_LOCATION,
        icon_size=26,
        icon_color=ft.Colors.GREY,
        tooltip="Включить слежение",
        bgcolor=ft.Colors.WHITE,
        on_click=lambda e: page.run_task(toggle_follow_bus),
    )
    async def toggle_follow_bus():
        nonlocal follow_bus
        follow_bus = not follow_bus
        if follow_bus:
            follow_button.icon_color = ft.Colors.BLUE
            follow_button.tooltip = "Отключить слежение"

            if smooth_lat is not None:
                await map_control.move_to(
                    destination=ftm.MapLatitudeLongitude(
                        latitude=smooth_lat,
                        longitude=smooth_lon,
                    )
                )
        else:
            follow_button.icon_color = ft.Colors.GREY
            follow_button.tooltip = "Включить слежение"
        page.update()

    def update_audio_buttons():
        for name, button in audio_buttons.items():
            if name == current_stop_name and not audio_paused:
                button.icon = ft.Icons.PAUSE_CIRCLE_FILLED
                button.tooltip = "Пауза"
            else:
                button.icon = ft.Icons.PLAY_CIRCLE_FILL
                button.tooltip = "Воспроизвести"

        for name, slider in audio_progress_bars.items():
            slider.disabled = (
                name != current_stop_name
                or audio_durations_ms[name] <= 0
            )

        page.update()

    def stop_card(stop):
        name = stop["name"]

        play_button = ft.IconButton(
            icon=ft.Icons.PLAY_CIRCLE_FILL,
            icon_size=36,
            tooltip="Воспроизвести",
            on_click=lambda e, s=stop: page.run_task(play_audio, s),
        )

        audio_buttons[name] = play_button

        position = audio_positions_ms[name]
        duration = audio_durations_ms[name]

        total_text = (
            format_audio_time(duration)
            if duration > 0 else "--:--"
        )

        # Ползунок перемотки
        progress_bar = ft.Slider(
            min=0,
            max=max(duration, 1),
            value=min(position, duration) if duration > 0 else 0,
            expand=True,
            disabled=(
                name != current_stop_name or duration <= 0
            ),

            # Начало перемотки
            on_change_start=lambda e, n=name:
                start_audio_seek(n, e),

            # Предварительный просмотр времени
            on_change=lambda e, n=name:
                preview_audio_seek(n, e),

            # Перемотка после отпускания ползунка
            on_change_end=lambda e, n=name:
                page.run_task(seek_audio, n, e.control.value),
        )

        time_label = ft.Text(
            f"{format_audio_time(position)} / {total_text}",
            size=11,
            color=ft.Colors.GREY,
        )

        audio_progress_bars[name] = progress_bar
        audio_time_labels[name] = time_label

        return ft.Card(
            content=ft.Container(
                padding=12,
                content=ft.Column(
                    spacing=8,
                    controls=[
                        ft.Row(
                            controls=[
                                ft.Container(
                                    width=48,
                                    height=48,
                                    border_radius=12,
                                    bgcolor=ft.Colors.BLUE_100,
                                    alignment=ft.Alignment.CENTER,
                                    content=ft.Icon(
                                        ft.Icons.MUSIC_NOTE,
                                        color=ft.Colors.BLUE_800,
                                        size=26,
                                    ),
                                ),
                                ft.Column(
                                    expand=True,
                                    spacing=4,
                                    controls=[
                                        ft.Text(
                                            name,
                                            weight=ft.FontWeight.BOLD,
                                            size=15,
                                        ),
                                        ft.Text(
                                            "Аудиорассказ об остановке",
                                            size=12,
                                            color=ft.Colors.GREY,
                                        ),
                                    ],
                                ),
                                play_button,
                            ],
                            vertical_alignment=ft.CrossAxisAlignment.CENTER,
                        ),
                        ft.Row(
                            controls=[
                                progress_bar,
                                time_label,
                            ],
                            spacing=10,
                            vertical_alignment=ft.CrossAxisAlignment.CENTER,
                        ),
                    ],
                ),
            )
        )
    
    async def stop_all_audio():
        nonlocal current_audio, current_stop_name, audio_paused

        if current_audio is None:
            return

        audio_to_stop = current_audio
        stopped_name = current_stop_name

        try:
            await audio_to_stop.pause()
            await save_audio_progress(
                stopped_name,
                audio_positions_ms[stopped_name],
            )
        except Exception as exc:
            print(f"Не удалось остановить аудио: {exc}")
        finally:
            current_audio = None
            current_stop_name = None
            audio_paused = False
            update_audio_buttons()
            log_info(f"Остановлено: {stopped_name}")

    async def reset_excursion():
        """Останавливает текущий рассказ и повторно разрешает GPS-срабатывания."""
        await stop_all_audio()

        for stop_name in triggered:
            triggered[stop_name] = False

        last_stop_text.value = "Последняя остановка: —"
        status_text.value = "Экскурсия сброшена. Остановки готовы к повторному запуску."
        page.update()

    async def play_audio(stop):
        nonlocal current_audio, current_stop_name, audio_paused

        print("НАЖАТИЕ КНОПКИ:", stop["name"])

        async with audio_lock:
            try:
                print("ШАГ 2: вошли в аудиоблок")

                # Повторное нажатие: пауза или продолжение.
                if current_audio is not None and current_stop_name == stop["name"]:
                    if audio_paused:
                        await current_audio.resume()
                        audio_paused = False
                        log_info(f"Сейчас играет: {stop['name']}")
                    else:
                        await current_audio.pause()

                        await save_audio_progress(
                            stop["name"],
                            audio_positions_ms[stop["name"]],
                        )

                        audio_paused = True
                        log_info(f"Пауза: {stop['name']}")

                    update_audio_buttons()
                    return

                # Останавливаем предыдущую запись.
                if current_audio is not None:
                    old_audio = current_audio
                    old_name = current_stop_name

                    print("ОСТАНАВЛИВАЕМ:", old_name)
                    await old_audio.pause()

                    await save_audio_progress(
                        old_name,
                        audio_positions_ms[old_name],
                    )

                    await asyncio.sleep(0.2)

                    current_audio = None
                    current_stop_name = None
                    audio_paused = False
                    update_audio_buttons()

                # Берём заранее созданный плеер.
                audio = audio_players[stop["name"]]

                current_audio = audio
                current_stop_name = stop["name"]
                audio_paused = False

                update_audio_buttons()

                start_position = audio_positions_ms[stop["name"]]

                refresh_audio_progress(stop["name"])

                print("ЗАПУСКАЕМ:", stop["name"])
                print("ВОЗОБНОВЛЯЕМ С ПОЗИЦИИ:", start_position)

                await audio.play(
                    ft.Duration(milliseconds=start_position)
                
                )

                print("ВОСПРОИЗВЕДЕНИЕ ЗАПУЩЕНО:", stop["name"])

                log_info(f"Сейчас играет: {stop['name']}")
                update_audio_buttons()

            except Exception as exc:
                print("ОШИБКА ВОСПРОИЗВЕДЕНИЯ:", repr(exc))

                current_audio = None
                current_stop_name = None
                audio_paused = False

                update_audio_buttons()

                show_error(
                    f"Не удалось воспроизвести «{stop['name']}». "
                    f"Подробности: {exc}"
                )

    async def check_location(lat, lon, speed):
        nonlocal smooth_lat, smooth_lon
        
        speed_text = "—" if speed is None else f"{speed * 3.6:.1f} км/ч"
        if smooth_lat is None:
            smooth_lat = lat
            smooth_lon = lon
        else:
            alpha = 0.3
            smooth_lat = smooth_lat + alpha * (lat - smooth_lat)
            smooth_lon = smooth_lon + alpha * (lon - smooth_lon)
        status_text.value = f"GPS: {lat:.5f}, {lon:.5f} · Скорость: {speed_text}"
        current_marker.coordinates = ftm.MapLatitudeLongitude(
            latitude=smooth_lat,
            longitude=smooth_lon,
        )
        if follow_bus:
            try:
                await map_control.move_to(
                    destination=current_marker.coordinates,
                )
            except Exception as exc:
                print(f"Не удалось переместить карту: {exc}")
        page.update()

        for stop in STOPS_343E:
            distance = haversine(lat, lon, stop["lat"], stop["lon"])
            if distance > trigger_radius_m:
                triggered[stop["name"]] = False
                continue
            if triggered[stop["name"]]:
                continue

            triggered[stop["name"]] = True
            page.run_task(play_audio, stop)
            last_stop_text.value = f"Последняя остановка: {stop['name']}"
            page.update()

    async def start_tracking():
        try:
            permission = await geo.request_permission()
            allowed = [
                ftg.GeolocatorPermissionStatus.WHILE_IN_USE,
                ftg.GeolocatorPermissionStatus.ALWAYS,
            ]
            if permission not in allowed:
                show_error("Нет разрешения на геолокацию. Разрешите доступ в настройках телефона.")
                return

            log_info("GPS запущен. Ожидание координат…")
            while True:
                try:
                    pos = await geo.get_current_position()
                    if pos:
                        speed = getattr(pos, "speed", None)
                        await check_location(pos.latitude, pos.longitude, speed)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    show_error(f"Ошибка GPS: {exc}")
                    await asyncio.sleep(5)
                await asyncio.sleep(2)
        except Exception as exc:
            show_error(f"Не удалось запустить GPS: {exc}")

    def start_tracking_on_click(e=None):
        nonlocal tracking_task
        if tracking_task is None or tracking_task.done():
            tracking_task = asyncio.create_task(start_tracking())
            log_info("Запускаем GPS…")
        else:
            show_error("GPS-экскурсия уже запущена.")

    def build_map_screen():
        return ft.Column(
            expand=True,
            scroll=ft.ScrollMode.AUTO,
            spacing=12,
            controls=[
                ft.Text("Маршрут 343Э", size=24, weight=ft.FontWeight.BOLD),
                ft.Text("Остановки и текущее местоположение", size=13, color=ft.Colors.GREY),
                ft.Container(
                    content=ft.Stack(
                        expand=True,
                        controls=[
                            map_control,
                            ft.TextButton(
                                content=ft.Image(src="yandex_logo.png", width=100),
                                url="https://yandex.ru/maps/",
                                tooltip="Открыть Яндекс Карты",
                                style=ft.ButtonStyle(padding=0),
                                left=0,
                                bottom=0,
                            ),
                            ft.Container(
                                content=follow_button,
                                right=12,
                                bottom=12,
                            ),
                        ],
                    ) if YANDEX_TILES_API_KEY else ft.Text(
                        "Для загрузки Яндекс Карт укажите ключ Tiles API "
                        "в YANDEX_TILES_API_KEY и перезапустите приложение."
                    ),
                    height=330,
                    border_radius=16,
                    clip_behavior=ft.ClipBehavior.ANTI_ALIAS,
                ),
                ft.Container(
                    padding=12,
                    border_radius=12,
                    bgcolor=ft.Colors.with_opacity(0.07, ft.Colors.BLUE),
                    content=ft.Column(spacing=6, controls=[status_text, last_stop_text]),
                ),
                ft.Button(
                    "▶  Начать экскурсию",
                    icon=ft.Icons.MY_LOCATION,
                    on_click=start_tracking_on_click,
                    width=float("inf"),
                ),
                ft.Text("Совет: разрешите доступ к геолокации при использовании приложения.", size=12, color=ft.Colors.GREY),
            ],
        )

    def build_audio_screen():
        return ft.Column(
            expand=True,
            scroll=ft.ScrollMode.AUTO,
            spacing=10,
            controls=[
                ft.Text("Аудиотека", size=24, weight=ft.FontWeight.BOLD),
                ft.Text("Рассказы по остановкам · работают без сети после правильной упаковки файлов", size=12, color=ft.Colors.GREY),
                *[stop_card(stop) for stop in STOPS_343E],
                ft.OutlinedButton(
                    "Остановить воспроизведение",
                    icon=ft.Icons.STOP_CIRCLE_OUTLINED,
                    on_click=lambda e: page.run_task(stop_all_audio),
                    width=float("inf"),
                ),
            ],
        )

    def on_radius_change(e):
        nonlocal trigger_radius_m
        trigger_radius_m = int(round(e.control.value))
        label = settings_controls.get("radius_label")
        if label is not None:
            label.value = f"{trigger_radius_m} м"
        page.update()

    async def save_radius_setting(e):
        try:
            await prefs.set("audio_guide_343e.trigger_radius_m", trigger_radius_m)
        except Exception as exc:
            print("Не удалось сохранить радиус GPS:", repr(exc))

    def on_volume_change(e):
        nonlocal audio_volume
        volume_percent = int(round(e.control.value))
        audio_volume = volume_percent / 100.0

        # Применяем громкость сразу ко всем заранее созданным плеерам.
        for audio in audio_players.values():
            audio.volume = audio_volume
            audio.update()

        label = settings_controls.get("volume_label")
        if label is not None:
            label.value = f"{volume_percent}%"
        page.update()

    async def save_volume_setting(e):
        try:
            await prefs.set("audio_guide_343e.audio_volume", audio_volume)
        except Exception as exc:
            print("Не удалось сохранить громкость:", repr(exc))

    async def change_theme(value):
        page.theme_mode = {
            "light": ft.ThemeMode.LIGHT,
            "dark": ft.ThemeMode.DARK,
            "system": ft.ThemeMode.SYSTEM,
        }[value]
        try:
            await prefs.set("audio_guide_343e.theme", value)
        except Exception as exc:
            print("Не удалось сохранить тему:", repr(exc))
        page.update()

    async def load_saved_settings():
        nonlocal trigger_radius_m, audio_volume
        try:
            saved_radius = await prefs.get("audio_guide_343e.trigger_radius_m")
            if saved_radius is not None:
                trigger_radius_m = max(15, min(50, int(saved_radius)))

            saved_volume = await prefs.get("audio_guide_343e.audio_volume")
            if saved_volume is not None:
                audio_volume = max(0.0, min(1.0, float(saved_volume)))

            saved_theme = await prefs.get("audio_guide_343e.theme")
            theme_modes = {
                "light": ft.ThemeMode.LIGHT,
                "dark": ft.ThemeMode.DARK,
                "system": ft.ThemeMode.SYSTEM,
            }
            if saved_theme in theme_modes:
                page.theme_mode = theme_modes[saved_theme]

            for audio in audio_players.values():
                audio.volume = audio_volume
                audio.update()

            radius_slider = settings_controls.get("radius_slider")
            radius_label = settings_controls.get("radius_label")
            if radius_slider is not None:
                radius_slider.value = trigger_radius_m
            if radius_label is not None:
                radius_label.value = f"{trigger_radius_m} м"

            volume_slider = settings_controls.get("volume_slider")
            volume_label = settings_controls.get("volume_label")
            if volume_slider is not None:
                volume_slider.value = int(round(audio_volume * 100))
            if volume_label is not None:
                volume_label.value = f"{int(round(audio_volume * 100))}%"

            page.update()
        except Exception as exc:
            print("Не удалось загрузить настройки:", repr(exc))

    def build_settings_screen():
        radius_label = ft.Text(f"{trigger_radius_m} м", weight=ft.FontWeight.BOLD)
        volume_label = ft.Text(
            f"{int(round(audio_volume * 100))}%",
            weight=ft.FontWeight.BOLD,
        )

        radius_slider = ft.Slider(
            min=15,
            max=50,
            divisions=7,
            value=trigger_radius_m,
            on_change=on_radius_change,
            on_change_end=save_radius_setting,
        )
        volume_slider = ft.Slider(
            min=0,
            max=100,
            divisions=20,
            value=int(round(audio_volume * 100)),
            on_change=on_volume_change,
            on_change_end=save_volume_setting,
        )

        settings_controls["radius_slider"] = radius_slider
        settings_controls["radius_label"] = radius_label
        settings_controls["volume_slider"] = volume_slider
        settings_controls["volume_label"] = volume_label

        return ft.Column(
            expand=True,
            scroll=ft.ScrollMode.AUTO,
            spacing=16,
            controls=[
                ft.Text("Настройки", size=24, weight=ft.FontWeight.BOLD),

                ft.Card(
                    content=ft.Container(
                        padding=16,
                        content=ft.Column(
                            spacing=8,
                            controls=[
                                ft.Row(
                                    controls=[
                                        ft.Icon(ft.Icons.GPS_FIXED, color=ft.Colors.BLUE),
                                        ft.Text("Радиус срабатывания GPS", size=17, weight=ft.FontWeight.BOLD),
                                        ft.Container(expand=True),
                                        radius_label,
                                    ],
                                ),
                                ft.Text(
                                    "Расстояние до остановки, при котором запускается рассказ.",
                                    size=12,
                                    color=ft.Colors.GREY,
                                ),
                                radius_slider,
                                ft.Row(
                                    controls=[
                                        ft.Text("15 м", size=11, color=ft.Colors.GREY),
                                        ft.Container(expand=True),
                                        ft.Text("50 м", size=11, color=ft.Colors.GREY),
                                    ],
                                ),
                            ],
                        ),
                    ),
                ),

                ft.Card(
                    content=ft.Container(
                        padding=16,
                        content=ft.Column(
                            spacing=8,
                            controls=[
                                ft.Row(
                                    controls=[
                                        ft.Icon(ft.Icons.VOLUME_UP, color=ft.Colors.BLUE),
                                        ft.Text("Громкость аудио", size=17, weight=ft.FontWeight.BOLD),
                                        ft.Container(expand=True),
                                        volume_label,
                                    ],
                                ),
                                ft.Row(
                                    controls=[
                                        ft.Icon(ft.Icons.VOLUME_OFF, color=ft.Colors.GREY),
                                        volume_slider,
                                        ft.Icon(ft.Icons.VOLUME_UP, color=ft.Colors.GREY),
                                    ],
                                    spacing=8,
                                ),
                            ],
                        ),
                    ),
                ),

                ft.Card(
                    content=ft.Container(
                        padding=16,
                        content=ft.Column(
                            spacing=8,
                            controls=[
                                ft.Text("Экскурсия", size=17, weight=ft.FontWeight.BOLD),
                                ft.Text(
                                    "Сбросить отметки остановок, чтобы пройти маршрут и прослушать рассказы заново.",
                                    size=12,
                                    color=ft.Colors.GREY,
                                ),
                                ft.OutlinedButton(
                                    "Сбросить экскурсию",
                                    icon=ft.Icons.REFRESH,
                                    on_click=lambda e: page.run_task(reset_excursion),
                                    width=float("inf"),
                                ),
                            ],
                        ),
                    ),
                ),

                ft.Card(
                    content=ft.Container(
                        padding=16,
                        content=ft.Column(
                            spacing=10,
                            controls=[
                                ft.Text("Оформление", size=17, weight=ft.FontWeight.BOLD),
                                ft.Text("Выбери удобную тему приложения."),
                                ft.Row(
                                    controls=[
                                        ft.OutlinedButton(
                                            "Светлая",
                                            on_click=lambda e: page.run_task(change_theme, "light"),
                                        ),
                                        ft.OutlinedButton(
                                            "Тёмная",
                                            on_click=lambda e: page.run_task(change_theme, "dark"),
                                        ),
                                        ft.OutlinedButton(
                                            "Системная",
                                            on_click=lambda e: page.run_task(change_theme, "system"),
                                        ),
                                    ],
                                    wrap=True,
                                ),
                            ],
                        ),
                    ),
                ),

                ft.Text(
                    "Аудиофайлы должны находиться в папке assets проекта.",
                    size=13,
                    color=ft.Colors.GREY,
                ),
                ft.Text(
                    f"Аудиогид 343Э · Версия {APP_VERSION}",
                    size=12,
                    color=ft.Colors.GREY,
                    text_align=ft.TextAlign.CENTER,
                ),
            ],
        )

    def render_screen(index):
        nonlocal selected_screen
        selected_screen = index
        content_host.content = [
            build_map_screen(),
            build_audio_screen(),
            build_settings_screen(),
        ][index]
        page.navigation_bar.selected_index = index
        page.update()

    page.navigation_bar = ft.NavigationBar(
        selected_index=0,
        on_change=lambda e: render_screen(e.control.selected_index),
        destinations=[
            ft.NavigationBarDestination(icon=ft.Icons.MAP_OUTLINED, selected_icon=ft.Icons.MAP, label="Карта"),
            ft.NavigationBarDestination(icon=ft.Icons.HEADPHONES_OUTLINED, selected_icon=ft.Icons.HEADPHONES, label="Аудио"),
            ft.NavigationBarDestination(icon=ft.Icons.SETTINGS_OUTLINED, selected_icon=ft.Icons.SETTINGS, label="Настройки"),
        ],
    )
    page.add(content_host)
    render_screen(0)
    page.run_task(load_saved_settings)


ft.run(main, assets_dir="assets")



