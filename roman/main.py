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
        "lat": 59.875730, "lon": 29.921022,
        "audio": "lomonosov.wav",
        # Направление движения в градусах (азимут).
        # 0 = север, 90 = восток, 180 = юг, 270 = запад.
        # Если None — направление не проверяется.
    },
    {
        "name": "Федюнинская улица",
        "lat": 59.902710, "lon": 29.770293,
        "audio": "faduninskaya.wav",
    },
    # ... остальные
]

# Радиус срабатывания. НЕ МЕНЬШЕ 15 метров — иначе GPS проскочит.
TRIGGER_RADIUS_M = 20

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
    audio_progress_bars = {}
    audio_time_labels = {}
    audio_is_seeking = {
    stop["name"]: False for stop in STOPS_343E
    }

    audio_positions_ms = {
        stop["name"]: 0 for stop in STOPS_343E
    }
    audio_durations_ms = {
        stop["name"]: 0 for stop in STOPS_343E
    }

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

    def handle_audio_position(name, e):
        audio_positions_ms[name] = int(e.position)
        refresh_audio_progress(name)

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

        except Exception as exc:
            print("ОШИБКА ПЕРЕМОТКИ:", repr(exc))
            show_error(f"Не удалось перемотать запись: {exc}")

        finally:
            audio_is_seeking[name] = False
            refresh_audio_progress(name)

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
            release_mode=fta.ReleaseMode.STOP,
            on_position_change=lambda e, name=stop["name"]: handle_audio_position(name, e),
            on_duration_change=lambda e, name=stop["name"]: handle_audio_duration(name, e),
        )
        page.services.append(audio)
        audio_players[stop["name"]] = audio
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
        layers=[
            ftm.TileLayer(
                url_template="https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                user_agent_package_name="audio-guide-343e",
            ),
            ftm.MarkerLayer(markers=stop_markers + [current_marker]),
            ftm.SimpleAttribution(text="© OpenStreetMap contributors"),
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

                audio_positions_ms[stop["name"]] = 0
                refresh_audio_progress(stop["name"])

                print("ЗАПУСКАЕМ:", stop["name"])
                await audio.play()

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
        nonlocal prev_pos, smooth_lat, smooth_lon
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
            if distance > TRIGGER_RADIUS_M:
                triggered[stop["name"]] = False
                continue
            if triggered[stop["name"]]:
                continue

            triggered[stop["name"]] = True
            page.run_task(play_audio, stop)
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
                ft.Container(
                content=ft.Stack(
                    expand=True,
                    controls=[
                        map_control,
                        ft.Container(
                            expand=True,
                            alignment=ft.Alignment.BOTTOM_RIGHT,
                            padding=12,
                            content=follow_button,
                        ),
                    ],
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