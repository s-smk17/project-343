import asyncio
import math
import time

import flet as ft
import flet_audio as fta
import flet_geolocator as ftg
import flet_map as ftm

# --- Точки маршрута ---
# Каждая точка — это "линия старта" аудио.
# Аудио запускается, когда автобус ПРОХОДИТ точку в заданном направлении.
STOPS_343E = [
    {
        "name": "Ломоносов, Вокзал",
        "lat": 59.917280, "lon": 29.769109,
        "audio": "lomonosov.WAV",
        # Направление движения в градусах (азимут).
        # 0 = север, 90 = восток, 180 = юг, 270 = запад.
        # Если None — направление не проверяется.
        "heading": 90,
    },
    {
        "name": "Федюнинская улица",
        "lat": 59.902710, "lon": 29.770293,
        "audio": "faduninskaya.WAV",
        "heading": 120,
    },
    # ... остальные
]

# Радиус срабатывания. НЕ МЕНЬШЕ 15 метров — иначе GPS проскочит.
TRIGGER_RADIUS_M = 20

# Насколько должна совпадать "сторона" движения с заданным азимутом.
# 60° — значит движение в пределах ±60° от заданного направления считается "правильным".
HEADING_TOLERANCE_DEG = 90

# Минимальная скорость, чтобы считать, что мы реально едем, а не стоим.
MIN_SPEED_MPS = 0.0


def haversine(lat1, lon1, lat2, lon2):
    """Расстояние в метрах между двумя точками."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bearing(lat1, lon1, lat2, lon2):
    """Азимут из точки 1 в точку 2 (0–360°)."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlambda = math.radians(lon2 - lon1)
    x = math.sin(dlambda) * math.cos(phi2)
    y = math.cos(phi1)*math.sin(phi2) - math.sin(phi1)*math.cos(phi2)*math.cos(dlambda)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def angle_diff(a, b):
    """Минимальная разница между двумя углами (0–180°)."""
    d = abs(a - b) % 360
    return min(d, 360 - d)


def main(page: ft.Page):
    page.title = "343Э — Аудиогид"
    page.padding = 0
    page.theme_mode = ft.ThemeMode.LIGHT
    page.theme = ft.Theme(color_scheme_seed=ft.Colors.BLUE)
    page.dark_theme = ft.Theme(color_scheme_seed=ft.Colors.BLUE)

    geo = ftg.Geolocator()
    page.services.append(geo)

    status_text = ft.Text("Экскурсия не запущена", size=13)
    last_stop_text = ft.Text("Последняя остановка: —", size=13, color=ft.Colors.GREY)
    content_host = ft.Container(expand=True, padding=16)
    audio_players = {}
    audio_buttons = {}
    audio_paused = False
    audio_lock = asyncio.Lock()
    triggered = {stop["name"]: False for stop in STOPS_343E}
    prev_pos = None
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
        for stop in STOPS_343E
    ]

    current_marker = ftm.Marker(
        coordinates=ftm.MapLatitudeLongitude(latitude=59.908, longitude=29.778),
        content=ft.Icon(ft.Icons.DIRECTIONS_BUS, color=ft.Colors.BLUE, size=32),
        width=40,
        height=40,
    )

    map_control = ftm.Map(
        expand=True,
        initial_center=ftm.MapLatitudeLongitude(latitude=59.908, longitude=29.778),
        initial_zoom=12,
        layers=[
            ftm.TileLayer(
                url_template="https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                user_agent_package_name="audio-guide-343e",
            ),
            ftm.MarkerLayer(markers=stop_markers + [current_marker]),
            ftm.SimpleAttribution(text="© OpenStreetMap contributors"),
        ],
    )

    def update_audio_buttons():
        for name, button in audio_buttons.items():
            if name == current_stop_name and not audio_paused:
                button.icon = ft.Icons.PAUSE_CIRCLE_FILLED
                button.tooltip = "Пауза"
            else:
                button.icon = ft.Icons.PLAY_CIRCLE_FILL
                button.tooltip = "Воспроизвести"
        page.update()

    def stop_card(stop):
        play_button = ft.IconButton(
            icon=ft.Icons.PLAY_CIRCLE_FILL,
            icon_size=36,
            tooltip="Воспроизвести",
            on_click=lambda e, s=stop: asyncio.create_task(play_audio(s)),
        )
        audio_buttons[stop["name"]] = play_button

        return ft.Card(
            content=ft.Container(
                padding=12,
                content=ft.Row(
                    controls=[
                        ft.Container(
                            width=48,
                            height=48,
                            border_radius=12,
                            bgcolor=ft.Colors.BLUE_100,
                            alignment=ft.Alignment.CENTER,
                            content=ft.Icon(ft.Icons.MUSIC_NOTE, color=ft.Colors.BLUE_800, size=26),
                        ),
                        ft.Column(
                            expand=True,
                            spacing=4,
                            controls=[
                                ft.Text(stop["name"], weight=ft.FontWeight.BOLD, size=15),
                                ft.Text("Аудиорассказ об остановке", size=12, color=ft.Colors.GREY),
                            ],
                        ),
                        play_button,
                    ],
                    vertical_alignment=ft.CrossAxisAlignment.CENTER,
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
        except Exception as exc:
            print(f"Не удалось остановить аудио: {exc}")
        finally:
            current_audio = None
            current_stop_name = None
            audio_paused = False
            update_audio_buttons()
            log_info(f"Остановлено: {stopped_name}")

    async def play_audio(stop):
        nonlocal current_audio, current_stop_name, audio_paused

        # Не допускаем одновременную обработку нескольких быстрых нажатий/GPS.
        async with audio_lock:
            try:
                # Повторное нажатие на текущую запись: пауза или продолжение.
                if current_audio is not None and current_stop_name == stop["name"]:
                    if audio_paused:
                        await current_audio.resume()
                        audio_paused = False
                        log_info(f"Сейчас играет: {stop['name']}")
                    else:
                        await current_audio.pause()
                        audio_paused = True
                        log_info(f"Пауза: {stop['name']}")
                    update_audio_buttons()
                    return

                # При выборе другой записи сначала ставим старую на паузу.
                if current_audio is not None:
                    old_audio = current_audio
                    await old_audio.pause()
                    current_audio = None
                    current_stop_name = None
                    audio_paused = False
                    update_audio_buttons()

                # Создаём плеер один раз для каждой записи.
                if stop["name"] not in audio_players:
                    audio = fta.Audio(src=stop["audio"], autoplay=False)
                    page.services.append(audio)
                    audio_players[stop["name"]] = audio
                    # Даём Flet время зарегистрировать новый service перед play().
                    page.update()
                    await asyncio.sleep(0.3)

                audio = audio_players[stop["name"]]
                current_audio = audio
                current_stop_name = stop["name"]
                audio_paused = False
                update_audio_buttons()

                await audio.play()
                log_info(f"Сейчас играет: {stop['name']}")
                update_audio_buttons()

            except Exception as exc:
                current_audio = None
                current_stop_name = None
                audio_paused = False
                update_audio_buttons()
                show_error(
                    f"Не удалось воспроизвести «{stop['name']}». "
                    f"Проверьте MP3 в папке assets. Подробности: {exc}"
                )

    async def check_location(lat, lon, speed):
        nonlocal prev_pos, smooth_lat, smooth_lon
        speed_text = "—" if speed is None else f"{speed:.1f} м/с"
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
        try:
            await map_control.move_to(
                destination=current_marker.coordinates,
            )
        except Exception as exc:
            print(f"Не удалось переместить карту: {exc}")
        page.update()

        current_heading = None
        if prev_pos is not None:
            prev_lat, prev_lon, _ = prev_pos
            if haversine(prev_lat, prev_lon, lat, lon) > 3:
                current_heading = bearing(prev_lat, prev_lon, lat, lon)

        for stop in STOPS_343E:
            distance = haversine(lat, lon, stop["lat"], stop["lon"])
            if distance > TRIGGER_RADIUS_M:
                triggered[stop["name"]] = False
                continue
            if triggered[stop["name"]]:
                continue
            if stop.get("heading") is not None and current_heading is not None:
                if angle_diff(current_heading, stop["heading"]) > HEADING_TOLERANCE_DEG:
                    continue

            triggered[stop["name"]] = True
            asyncio.create_task(play_audio(stop))
            last_stop_text.value = f"Последняя остановка: {stop['name']}"
            page.update()

        if prev_pos is None or haversine(prev_pos[0], prev_pos[1], lat, lon) > 2:
            prev_pos = (lat, lon, time.monotonic())

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
                ft.Container(content=map_control, height=330, border_radius=16, clip_behavior=ft.ClipBehavior.ANTI_ALIAS),
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
                    on_click=lambda e: asyncio.create_task(stop_all_audio()),
                    width=float("inf"),
                ),
            ],
        )

    def build_settings_screen():
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
                            spacing=10,
                            controls=[
                                ft.Text("Оформление", size=17, weight=ft.FontWeight.BOLD),
                                ft.Text("Выбери удобную тему приложения."),
                                ft.Row(
                                    controls=[
                                        ft.OutlinedButton(
                                            "Светлая",
                                            on_click=lambda e: change_theme("light"),
                                        ),
                                        ft.OutlinedButton(
                                            "Тёмная",
                                            on_click=lambda e: change_theme("dark"),
                                        ),
                                        ft.OutlinedButton(
                                            "Системная",
                                        on_click=lambda e: change_theme("system"),
                                        ),
                                    ],
                                    wrap=True,
                                ),
                            ],
                        ),
                    ),
                ),
                ft.Text("Аудиофайлы должны находиться в папке assets проекта.", size=13, color=ft.Colors.GREY),
            ],
        )

    def change_theme(value):
        page.theme_mode = {
            "light": ft.ThemeMode.LIGHT,
            "dark": ft.ThemeMode.DARK,
            "system": ft.ThemeMode.SYSTEM,
        }[value]
        page.update()

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


ft.run(main, assets_dir="assets")
