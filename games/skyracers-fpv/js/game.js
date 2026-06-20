        // Three.jsの描画、飛行物理、入力、レース進行、保存データを単一状態で同期する。
        // 機体基礎値はdrone-data.js、起動前エラー表示はerror-handler.jsに依存する。

        // 画面文言はUI更新関数からTEXTキーを参照し、言語切替時に再適用する。
        const TEXT = {
            EN: {
                startRace: "Time Attack",
                freeFlight: "Free Flight",
                settings: "Settings",
                back: "Back",
                tracks: "Tracks",
                garage: "Garage",
                prep: "FLIGHT PREP",
                selectTerrain: "SELECT FREE FLIGHT COURSE",
                missionStart: "TIME ATTACK",
                missionSub: "Fly through the first gate and keep the laps flowing.",
                courseComplete: "LAP COMPLETE",
                replay: "Restart Run",
                toMenu: "Back to Menu",
                resume: "Resume",
                restart: "Restart",
                quit: "Quit to Menu",
                custom: "CUSTOM TUNING"
            },
            JP: {
                startRace: "タイムアタック",
                freeFlight: "フリーフライト",
                settings: "設定",
                back: "戻る",
                tracks: "コース",
                garage: "ガレージ",
                prep: "フライト準備",
                selectTerrain: "地形選択",
                missionStart: "タイムアタック",
                missionSub: "最初のゲートを通過してラップをつなげよう。",
                courseComplete: "ラップ完了",
                replay: "再スタート",
                toMenu: "メニューへ戻る",
                resume: "再開",
                restart: "リスタート",
                quit: "終了してメニューへ",
                custom: "機体チューニング"
            }
        };

        // DRONE_CLASS_PROFILESは実データをゲーム向け速度・応答・抗力へ正規化する基準値。
        const CONSTANTS = {
            GRAVITY: 25.0,
            TERRAINS: { PLAINS: 'Plains', MOUNTAINS: 'Mountains', STADIUM: 'Stadium', RUINS: 'Ruins' }
        };

        const DRONE_CLASS_PROFILES = {
            tiny_whoop_fpv: { speed: 34, agility: 10.0, weight: 0.48, motorResponse: 24.0, drag: 0.0017, refMassKg: 0.026, refVoltage: 3.8, refSizeMm: 65, minVoltageRatio: 0.78 },
            palm_selfie_drone: { speed: 42, agility: 5.2, weight: 0.70, motorResponse: 9.0, drag: 0.0011, refMassKg: 0.135, refVoltage: 7.3, refSizeMm: 157, minVoltageRatio: 0.80 },
            sub250_camera_drone: { speed: 55, agility: 4.8, weight: 0.82, motorResponse: 8.2, drag: 0.00095, refMassKg: 0.249, refVoltage: 7.32, refSizeMm: 373, minVoltageRatio: 0.80 },
            mid_size_folding_camera_drone: { speed: 80, agility: 4.2, weight: 1.15, motorResponse: 7.0, drag: 0.00080, refMassKg: 0.724, refVoltage: 14.6, refSizeMm: 325, minVoltageRatio: 0.84 },
            racing_fpv_5inch: { speed: 152, agility: 9.5, weight: 0.56, motorResponse: 26.0, drag: 0.00034, refMassKg: 0.42, refVoltage: 22.2, refSizeMm: 220, minVoltageRatio: 0.72 },
            cinema_drone: { speed: 115, agility: 2.8, weight: 2.10, motorResponse: 5.0, drag: 0.00055, refMassKg: 3.995, refVoltage: 23.1, refSizeMm: 695, minVoltageRatio: 0.86 },
            enterprise_industrial_drone: { speed: 92, agility: 2.0, weight: 2.70, motorResponse: 4.2, drag: 0.00048, refMassKg: 6.47, refVoltage: 44.76, refSizeMm: 895, minVoltageRatio: 0.86 },
            legacy_heavy_hex: { speed: 86, agility: 1.8, weight: 3.00, motorResponse: 3.8, drag: 0.00045, refMassKg: 9.5, refVoltage: 22.2, refSizeMm: 1133, minVoltageRatio: 0.85 },
            heavy_lift_cine_rig: { speed: 104, agility: 1.5, weight: 3.40, motorResponse: 3.4, drag: 0.00038, refMassKg: 19.8, refVoltage: 44.4, refSizeMm: 2273, minVoltageRatio: 0.86 },
            default: { speed: 60, agility: 5.0, weight: 1.00, motorResponse: 8.0, drag: 0.00090, refMassKg: 0.8, refVoltage: 14.8, refSizeMm: 320, minVoltageRatio: 0.82 }
        };

        const DRONE_CLASS_PALETTE = [0x22d3ee, 0x60a5fa, 0x818cf8, 0x34d399, 0xf59e0b, 0xf97316, 0xf43f5e, 0xe879f9];
        const FALLBACK_DRONE_DATA = {
            classes: [{
                class_id: 'starter_fpv',
                display_name_ja: 'starter fpv',
                design_role: 'General practice quad',
                battery_voltage_band_v: '14.8 V',
                entries: [{
                    entry_id: 'starter_fpv_01',
                    type_note: 'fallback starter quad',
                    aircraft: { takeoff_weight_g: 650, wheelbase_mm: 220 },
                    battery: { nominal_voltage_v: 14.8, max_charge_voltage_v: 16.8, pack_count_typical: 1 },
                    performance: { max_flight_time_min: 8 },
                    gameplay_tags: ['fpv', 'starter']
                }]
            }]
        };

        function clampNumber(value, min, max) {
            return Math.min(max, Math.max(min, value));
        }

        function parseNumericValue(value) {
            if (Number.isFinite(value)) return value;
            if (typeof value !== 'string') return null;
            const match = value.match(/-?\d+(?:\.\d+)?/);
            return match ? parseFloat(match[0]) : null;
        }

        function firstFinite(...values) {
            for (const value of values) {
                if (Number.isFinite(value)) return value;
            }
            return null;
        }

        function maxDimension(list) {
            if (!Array.isArray(list)) return null;
            const values = list.map(parseNumericValue).filter(Number.isFinite);
            return values.length ? Math.max(...values) : null;
        }

        function getPackCount(battery = {}) {
            return Math.max(1, parseNumericValue(battery.pack_count_typical) || 1);
        }

        function getBatteryWeightKg(battery = {}) {
            const directKg = firstFinite(
                parseNumericValue(battery.battery_weight_kg),
                parseNumericValue(battery.example_flight_pack?.weight_per_battery_kg)
            );
            if (Number.isFinite(directKg)) return directKg;
            const pairKg = parseNumericValue(battery.example_flight_pack?.weight_pair_kg);
            if (Number.isFinite(pairKg)) return pairKg / getPackCount(battery);
            const grams = firstFinite(
                parseNumericValue(battery.battery_weight_g),
                parseNumericValue(battery.battery_weight_g_example),
                parseNumericValue(battery.standard_weight_g),
                parseNumericValue(battery.optional_weight_g)
            );
            return Number.isFinite(grams) ? grams / 1000 : null;
        }

        function getFlightMassKg(entry) {
            const aircraft = entry.aircraft || {};
            const battery = entry.battery || {};
            const explicitKg = firstFinite(
                parseNumericValue(aircraft.takeoff_weight_kg),
                parseNumericValue(aircraft.weight_with_two_batteries_kg),
                parseNumericValue(aircraft.weight_with_six_TB47S_batteries_kg),
                parseNumericValue(aircraft.weight_with_six_TB48S_batteries_kg),
                parseNumericValue(aircraft.maximum_gross_takeoff_weight_kg),
                parseNumericValue(aircraft.recommended_max_takeoff_weight_kg),
                parseNumericValue(aircraft.max_takeoff_weight_kg),
                parseNumericValue(aircraft.weight_with_gimbal_camera_two_batteries_lens_ssd_propellers_g) / 1000,
                parseNumericValue(aircraft.takeoff_weight_g) / 1000
            );
            if (Number.isFinite(explicitKg)) return explicitKg;
            const takeoffNote = parseNumericValue(aircraft.takeoff_weight_note);
            if (Number.isFinite(takeoffNote)) return takeoffNote / 1000;
            const dryMassKg = firstFinite(
                parseNumericValue(aircraft.weight_without_batteries_kg),
                parseNumericValue(aircraft.typical_standard_empty_weight_kg),
                parseNumericValue(aircraft.weight_g) / 1000
            );
            const batteryWeightKg = getBatteryWeightKg(battery);
            if (Number.isFinite(dryMassKg) && Number.isFinite(batteryWeightKg)) {
                return dryMassKg + batteryWeightKg * getPackCount(battery);
            }
            return firstFinite(dryMassKg, 0.8);
        }

        function getSizeMm(entry) {
            const aircraft = entry.aircraft || {};
            return firstFinite(
                parseNumericValue(aircraft.wheelbase_mm),
                parseNumericValue(aircraft.diagonal_wheelbase_mm),
                parseNumericValue(aircraft.diagonal_distance_mm?.landing_gear_lowered),
                parseNumericValue(aircraft.diagonal_distance_mm?.landing_gear_raised),
                parseNumericValue(aircraft.unfolded_diameter_with_props_mm),
                parseNumericValue(aircraft.unfolded_diameter_without_props_mm),
                maxDimension(aircraft.dimensions_unfolded_mm),
                maxDimension(aircraft.dimensions_mm),
                maxDimension(aircraft.travel_mode_dimensions_mm),
                maxDimension(aircraft.dimensions_folded_mm),
                parseNumericValue(aircraft.height_mm),
                220
            );
        }

        function getNominalVoltage(entry) {
            const battery = entry.battery || {};
            return firstFinite(
                parseNumericValue(battery.nominal_voltage_v),
                parseNumericValue(battery.standard_nominal_voltage_v),
                parseNumericValue(battery.plus_battery_option?.nominal_voltage_v),
                14.8
            );
        }

        function getBatteryMaxVoltage(entry, nominalVoltage) {
            const battery = entry.battery || {};
            return firstFinite(
                parseNumericValue(battery.max_charge_voltage_v),
                parseNumericValue(battery.plus_battery_option?.max_charge_voltage_v),
                nominalVoltage * 1.15
            );
        }

        function getFlightTimeMin(entry) {
            const performance = entry.performance || {};
            return firstFinite(
                parseNumericValue(performance.max_flight_time_min),
                parseNumericValue(performance.flight_time_min_example),
                parseNumericValue(performance.max_hover_time_min),
                8
            );
        }

        function getBatteryEnergyWh(entry, nominalVoltage) {
            const battery = entry.battery || {};
            return firstFinite(
                parseNumericValue(battery.energy_Wh),
                parseNumericValue(battery.standard_energy_Wh),
                parseNumericValue(battery.plus_battery_option?.energy_Wh),
                parseNumericValue(battery.capacity_mAh) * nominalVoltage / 1000,
                parseNumericValue(battery.standard_capacity_mAh) * firstFinite(parseNumericValue(battery.standard_nominal_voltage_v), nominalVoltage) / 1000,
                parseNumericValue(battery.example_flight_pack?.capacity_Ah) * nominalVoltage
            );
        }

        function formatDroneClassName(classSpec) {
            return classSpec.display_name_ja || classSpec.class_id.replace(/_/g, ' ');
        }

        function formatMassKg(value) {
            if (!Number.isFinite(value)) return '--';
            return `${value < 1 ? value.toFixed(2) : value.toFixed(1)} kg`;
        }

        function formatMinutes(value) {
            return Number.isFinite(value) ? `${value.toFixed(0)} min` : '--';
        }

        function getTopSpeedKmh(entry) {
            const performance = entry.performance || {};
            return firstFinite(
                parseNumericValue(performance.max_speed_km_h),
                parseNumericValue(performance.max_speed_kph),
                parseNumericValue(performance.max_horizontal_speed_km_h),
                parseNumericValue(performance.max_horizontal_speed_m_s) * 3.6,
                parseNumericValue(performance.max_speed_m_s) * 3.6
            );
        }

        function normalizeDroneEntry(classSpec, entry, classIndex, entryIndex) {
            const profile = DRONE_CLASS_PROFILES[classSpec.class_id] || DRONE_CLASS_PROFILES.default;
            const className = formatDroneClassName(classSpec);
            const massKg = getFlightMassKg(entry);
            const sizeMm = getSizeMm(entry);
            const batteryNominal = getNominalVoltage(entry);
            const batteryMax = getBatteryMaxVoltage(entry, batteryNominal);
            const flightTimeMin = getFlightTimeMin(entry);
            const topSpeedKmh = getTopSpeedKmh(entry);
            const batteryEnergyWh = getBatteryEnergyWh(entry, batteryNominal);
            const minVoltage = clampNumber(batteryNominal * profile.minVoltageRatio, batteryNominal * 0.55, batteryMax - 0.2);
            const speedScale = clampNumber(Math.pow(batteryNominal / profile.refVoltage, 0.18) * Math.pow(sizeMm / profile.refSizeMm, 0.08), 0.82, 1.24);
            const agilityScale = clampNumber(Math.pow(profile.refMassKg / Math.max(massKg, 0.02), 0.16), 0.75, 1.25);
            const weightScale = clampNumber(Math.pow(Math.max(massKg, 0.02) / profile.refMassKg, 0.18), 0.72, 1.35);
            const responseScale = clampNumber(Math.pow(profile.refMassKg / Math.max(massKg, 0.02), 0.12), 0.78, 1.18);
            const sizeScale = clampNumber(Math.pow(sizeMm / profile.refSizeMm, -0.08), 0.82, 1.16);
            const massDragScale = clampNumber(Math.pow(Math.max(massKg, 0.02) / profile.refMassKg, -0.05), 0.86, 1.12);
            const speedBase = profile.speed * speedScale;
            const speed = Math.round(clampNumber(Number.isFinite(topSpeedKmh) ? Math.max(speedBase, topSpeedKmh * 0.82) : speedBase, 20, 220));
            const agility = Number(clampNumber(profile.agility * agilityScale, 1.2, 10.5).toFixed(1));
            const weight = Number(clampNumber(profile.weight * weightScale, 0.45, 3.6).toFixed(2));
            const motorResponse = Number(clampNumber(profile.motorResponse * responseScale, 3.0, 28.0).toFixed(1));
            const drag = Number(clampNumber(profile.drag * sizeScale * massDragScale, 0.00022, 0.0019).toFixed(5));
            const batterySpan = Math.max(0.5, batteryMax - minVoltage);
            const drainPerSecond = batterySpan / Math.max(120, flightTimeMin * 60);
            const explicitName = entry.display_name || entry.model_name || null;
            const name = explicitName || ((classSpec.entries?.length || 0) > 1 ? `${className} ${entryIndex + 1}` : className);
            return {
                id: entry.entry_id,
                name,
                classId: classSpec.class_id,
                className,
                typeNote: entry.type_note || classSpec.design_role || 'Ready for launch.',
                designRole: classSpec.design_role || 'General purpose',
                batteryBand: classSpec.battery_voltage_band_v || '--',
                color: DRONE_CLASS_PALETTE[classIndex % DRONE_CLASS_PALETTE.length],
                gameplayTags: Array.isArray(entry.gameplay_tags) ? entry.gameplay_tags : [],
                speed,
                agility,
                weight,
                motorResponse,
                drag,
                massKg: Number(massKg.toFixed(3)),
                sizeMm: Math.round(sizeMm),
                batteryNominal: Number(batteryNominal.toFixed(2)),
                batteryMax: Number(batteryMax.toFixed(2)),
                batteryMin: Number(minVoltage.toFixed(2)),
                batteryEnergyWh: Number((batteryEnergyWh || 0).toFixed(2)),
                batteryDrainBase: Number((drainPerSecond * 0.22).toFixed(5)),
                batteryDrainThrottle: Number((drainPerSecond * 2.05).toFixed(5)),
                flightTimeMin: Number(flightTimeMin.toFixed(1)),
                topSpeedKmh: Number.isFinite(topSpeedKmh) ? Math.round(topSpeedKmh) : null
            };
        }

        const droneDataSource = window.DRONE_CLASS_DATA?.classes?.length ? window.DRONE_CLASS_DATA : FALLBACK_DRONE_DATA;
        const DRONE_CLASSES = droneDataSource.classes.map((classSpec, classIndex) => {
            const entries = (classSpec.entries || []).map((entry, entryIndex) => normalizeDroneEntry(classSpec, entry, classIndex, entryIndex));
            return {
                id: classSpec.class_id,
                displayName: formatDroneClassName(classSpec),
                designRole: classSpec.design_role || 'General purpose',
                batteryBand: classSpec.battery_voltage_band_v || '--',
                entries
            };
        }).filter(droneClass => droneClass.entries.length > 0);

        const DRONE_ENTRIES = DRONE_CLASSES.flatMap(droneClass => droneClass.entries);
        const DRONE_ENTRY_MAP = new Map(DRONE_ENTRIES.map(entry => [entry.id, entry]));
        const DEFAULT_DRONE_CLASS = DRONE_CLASSES[0];
        const DEFAULT_DRONE_ENTRY = DEFAULT_DRONE_CLASS.entries[0];

        function getDroneClassById(classId) {
            return DRONE_CLASSES.find(droneClass => droneClass.id === classId) || DEFAULT_DRONE_CLASS;
        }

        function getDroneEntryById(entryId) {
            return DRONE_ENTRY_MAP.get(entryId) || DEFAULT_DRONE_ENTRY;
        }

        const COURSE_STYLES = {
            [CONSTANTS.TERRAINS.PLAINS]: { sky: 0x6da9d5, fog: 0x8ab9d8, groundLow: "#6f8f5f", groundMid: "#507247", groundHigh: "#3d5c38", trackBed: "#8c9b66", structure: "#8f7a63", support: "#4b5563", trim: "#fde68a" },
            [CONSTANTS.TERRAINS.MOUNTAINS]: { sky: 0x5c7fa8, fog: 0x7392b4, groundLow: "#5c6b6f", groundMid: "#47545b", groundHigh: "#2f3942", trackBed: "#687985", structure: "#8b95a1", support: "#374151", trim: "#bfdbfe" },
            [CONSTANTS.TERRAINS.RUINS]: { sky: 0x7e8a78, fog: 0x909a84, groundLow: "#8d835f", groundMid: "#756c4d", groundHigh: "#5a523a", trackBed: "#9a8f67", structure: "#b59f77", support: "#5b5344", trim: "#fcd34d" },
            [CONSTANTS.TERRAINS.STADIUM]: { sky: 0x0f172a, fog: 0x18243d, groundLow: "#334155", groundMid: "#1f2937", groundHigh: "#111827", trackBed: "#475569", structure: "#94a3b8", support: "#0f172a", trim: "#22d3ee" }
        };

        const COURSE_LAYOUTS = {
            razorback: { profile: 'Showcase Flow', difficulty: 'Medium', tagline: 'Sprint the straight, summit the platform, sweep the tower arc, dive the tunnel home.', gates: [[0,12,0],[0,12,48],[0,12,96],[28,22,136],[72,36,152],[116,42,126],[130,28,72],[114,16,18],[68,12,-10],[26,16,-22]], props: [{ type: 'arch', position: [0,8,24], size: [28,18,10] }, { type: 'arch', position: [0,8,72], size: [28,18,10] }, { type: 'platform', position: [50,14,148], size: [66,6,46] }, { type: 'tower', position: [118,40,144], size: [16,78,16] }, { type: 'bridge', position: [124,22,44], size: [14,4,108] }, { type: 'tunnel', position: [90,10,2], size: [32,16,62] }] },
            switchyard: { profile: 'Technical', difficulty: 'Hard', tagline: 'Short sightlines and sharp corrections through a woven line.', gates: [[0,12,0],[26,14,24],[-12,18,58],[34,22,94],[-28,18,124],[38,14,152],[4,12,188]], props: [{ type: 'tower', position: [18,18,46], size: [12,34,12] }, { type: 'tower', position: [-18,20,88], size: [12,40,12] }, { type: 'tunnel', position: [14,10,140], size: [34,16,50], rotation: 22 }, { type: 'wall', position: [-4,12,100], size: [18,24,140], rotation: 32 }] },
            skylineStep: { profile: 'Vertical Climb', difficulty: 'Hard', tagline: 'A terrace climb that rewards smooth throttle discipline.', gates: [[0,12,0],[0,18,42],[26,28,76],[58,38,110],[96,48,132],[122,42,94],[146,30,48],[118,20,8]], props: [{ type: 'platform', position: [20,8,38], size: [54,6,34] }, { type: 'platform', position: [58,18,84], size: [58,8,38] }, { type: 'platform', position: [106,30,120], size: [64,8,42] }, { type: 'tower', position: [142,28,84], size: [18,54,18] }] },
            corkscrew: { profile: 'Orbit', difficulty: 'Medium', tagline: 'Circle a landmark tower and stay composed through the exit.', gates: [[0,14,0],[34,18,28],[66,24,20],[90,30,-12],[78,38,-54],[38,30,-82],[-8,22,-68],[-36,16,-24]], props: [{ type: 'tower', position: [28,30,-22], size: [22,62,22] }, { type: 'bridge', position: [60,22,-18], size: [62,4,12], rotation: -12 }, { type: 'arch', position: [8,12,-64], size: [34,18,10] }, { type: 'wall', position: [-30,10,-10], size: [18,20,92], rotation: 18 }] },
            tunnelRush: { profile: 'Commitment', difficulty: 'Medium', tagline: 'A tunnel chain with just enough open air to punish hesitation.', gates: [[0,12,0],[0,12,36],[0,14,74],[28,18,110],[64,18,138],[100,16,112],[132,14,76],[140,12,28]], props: [{ type: 'tunnel', position: [0,9,56], size: [28,16,74] }, { type: 'tunnel', position: [82,12,120], size: [30,16,70], rotation: 48 }, { type: 'tower', position: [138,20,52], size: [12,42,12] }, { type: 'bridge', position: [70,20,92], size: [86,4,12], rotation: 26 }] },
            overUnder: { profile: 'Overpass', difficulty: 'Hard', tagline: 'You cross your own line twice, so the height calls must be clean.', gates: [[0,12,0],[0,22,44],[40,30,82],[88,18,82],[122,10,44],[88,18,8],[40,30,8],[-6,20,42]], props: [{ type: 'bridge', position: [44,24,44], size: [118,4,14], rotation: 0 }, { type: 'bridge', position: [64,18,44], size: [104,4,14], rotation: 90 }, { type: 'tower', position: [14,18,76], size: [14,42,14] }, { type: 'tower', position: [112,14,14], size: [14,34,14] }] },
            spireWeave: { profile: 'Precision', difficulty: 'Hard', tagline: 'Thread the spires without over-correcting.', gates: [[0,12,0],[30,14,30],[-14,16,62],[44,20,100],[2,28,138],[-38,18,106],[-70,14,58],[-42,12,18]], props: [{ type: 'tower', position: [10,18,44], size: [12,38,12] }, { type: 'tower', position: [18,22,88], size: [12,46,12] }, { type: 'tower', position: [-28,16,84], size: [12,34,12] }, { type: 'tower', position: [-20,22,126], size: [12,46,12] }] },
            arenaSplit: { profile: 'Rhythm', difficulty: 'Medium', tagline: 'Fast lane changes in a readable but busy arena bowl.', gates: [[0,10,0],[36,12,24],[76,16,24],[116,22,0],[76,26,-26],[38,20,-24],[0,14,-42],[-38,12,-14],[-76,10,18]], props: [{ type: 'wall', position: [22,10,34], size: [210,18,10], rotation: 0 }, { type: 'wall', position: [22,10,-44], size: [210,18,10], rotation: 0 }, { type: 'stand', position: [22,8,72], size: [220,18,42] }, { type: 'stand', position: [22,8,-82], size: [220,18,42] }] },
            vaultDrop: { profile: 'Big Drop', difficulty: 'Hard', tagline: 'Climb high, commit to the drop, and catch the recovery line.', gates: [[0,14,0],[0,18,36],[18,34,74],[54,54,104],[102,44,120],[126,20,86],[98,10,36],[54,12,4]], props: [{ type: 'platform', position: [42,26,76], size: [72,8,42] }, { type: 'bridge', position: [92,44,112], size: [86,4,14], rotation: 28 }, { type: 'tower', position: [116,22,68], size: [14,48,14] }, { type: 'arch', position: [78,10,20], size: [40,18,10] }] },
            ladderGrid: { profile: 'Gridline', difficulty: 'Medium', tagline: 'Boxy rooftop hops with a clean visual read at race pace.', gates: [[0,12,0],[28,16,30],[58,20,62],[92,24,96],[126,28,126],[154,24,92],[124,18,58],[88,14,24],[46,12,-2]], props: [{ type: 'platform', position: [26,8,28], size: [34,6,34] }, { type: 'platform', position: [72,14,74], size: [38,6,38] }, { type: 'platform', position: [124,20,118], size: [42,6,42] }, { type: 'wall', position: [112,12,42], size: [18,24,120], rotation: 38 }] },
            microPulse: { profile: 'Tiny Sprint', difficulty: 'Easy', tagline: 'Built for tiny quads: fast resets, close gates, and no dead air.', compact: true, gates: [[0,8,0],[0,8,18],[14,9,32],[28,10,22],[22,9,4],[6,8,-10],[-12,8,2]], props: [{ type: 'arch', position: [0,6,10], size: [16,12,8] }, { type: 'wall', position: [20,8,18], size: [12,16,34], rotation: 22 }, { type: 'platform', position: [-6,5,-2], size: [20,4,18] }] },
            patioSlalom: { profile: 'Whoop Slalom', difficulty: 'Medium', tagline: 'A compact back-and-forth where tiny drones stay loaded every second.', compact: true, gates: [[0,8,0],[12,9,16],[-8,10,30],[18,11,44],[-14,10,56],[10,9,70],[-6,8,84]], props: [{ type: 'tower', position: [8,10,22], size: [8,20,8] }, { type: 'tower', position: [-8,10,50], size: [8,20,8] }, { type: 'arch', position: [2,7,74], size: [18,12,8] }, { type: 'wall', position: [0,8,40], size: [10,16,86], rotation: 14 }] },
            pocketOrbit: { profile: 'Pocket Orbit', difficulty: 'Medium', tagline: 'A tiny orbit loop that keeps low-mass drones carving nonstop.', compact: true, gates: [[0,8,0],[16,10,10],[24,12,-4],[18,13,-22],[0,12,-28],[-18,10,-18],[-22,9,0],[-10,8,12]], props: [{ type: 'tower', position: [0,16,-6], size: [10,30,10] }, { type: 'bridge', position: [2,12,-6], size: [34,4,10], rotation: 90 }, { type: 'arch', position: [-8,7,6], size: [18,12,8] }] }
        };

        const COURSE_THEME_GROUPS = [
            { terrain: CONSTANTS.TERRAINS.PLAINS, names: ['Dust Arc','Switchgrass','Sunstep Rise','Haywire Coil','Dryline Rush','Mesa Overpass','Needle Weave','Field Split','Vaulted Dune','Grid Harvest','Pocket Pulse','Patio Dash','Barn Orbit'] },
            { terrain: CONSTANTS.TERRAINS.MOUNTAINS, names: ['Granite Arc','Snowdrift Switch','Summit Step','Frost Coil','Cliffline Rush','Highpass Over','Spire Crest','Basin Split','Skyvault Drop','Ridge Grid','Pocket Pulse Alpine','Patio Dash Ridge','Summit Orbit'] },
            { terrain: CONSTANTS.TERRAINS.RUINS, names: ['Relic Arc','Archive Switch','Oracle Step','Shard Coil','Vaultline Rush','Broken Over','Pillar Weave','Court Split','Crypt Drop','Temple Grid','Pocket Pulse Ruins','Patio Dash Vault','Relic Orbit'] },
            { terrain: CONSTANTS.TERRAINS.STADIUM, names: ['Neon Arc','Pulse Switch','Floodlight Step','Circuit Coil','Velocity Rush','Apex Over','Signal Weave','Arena Split X','Titan Drop','Broadcast Grid','Pocket Pulse X','Patio Dash X','Neon Orbit Mini'] }
        ];

        function rotateXZ(x, z, degrees) {
            const rad = THREE.MathUtils.degToRad(degrees || 0);
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            return { x: x * cos - z * sin, z: x * sin + z * cos };
        }

        function transformPoint(point, transform = {}) {
            const scale = transform.scale ?? 1;
            const heightScale = transform.heightScale ?? 1;
            const offset = transform.offset ?? [0, 0, 0];
            const rotated = rotateXZ(point[0] * scale, point[2] * scale, transform.rotation || 0);
            return [rotated.x + offset[0], point[1] * heightScale + (transform.lift || 0) + offset[1], rotated.z + offset[2]];
        }

        function transformSize(size, transform = {}) {
            const scale = transform.scale ?? 1;
            const heightScale = transform.heightScale ?? 1;
            return [size[0] * scale, size[1] * heightScale, size[2] * scale];
        }

        function buildGateLayout(points) {
            return points.map((posVec, index) => {
                const prev = points[Math.max(index - 1, 0)];
                const next = points[Math.min(index + 1, points.length - 1)];
                const dir = (index === points.length - 1 ? posVec.clone().sub(prev) : next.clone().sub(posVec)).setY(0);
                if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
                dir.normalize();
                return { posVec, rotEuler: new THREE.Euler(0, -Math.atan2(dir.x, dir.z), 0), id: index };
            });
        }

        function getTrackLengthMeters(gateLayout) {
            if (!Array.isArray(gateLayout) || gateLayout.length < 2) return 0;
            let total = 0;
            for (let index = 1; index < gateLayout.length; index++) {
                total += gateLayout[index - 1].posVec.distanceTo(gateLayout[index].posVec);
            }
            return Math.round(total);
        }

        function getPropFootprintRadius(prop) {
            const size = prop?.size || [0, 0, 0];
            return Math.max(4, Math.hypot(size[0] * 0.5, size[2] * 0.5));
        }

        function getPropHeightHalf(prop) {
            const size = prop?.size || [0, 0, 0];
            return Math.max(3, size[1] * 0.5);
        }

        function distancePointToSegmentXZ(point, start, end) {
            const segX = end.x - start.x;
            const segZ = end.z - start.z;
            const lenSq = segX * segX + segZ * segZ;
            if (lenSq < 0.0001) {
                const closest = new THREE.Vector3(start.x, point.y, start.z);
                return { distance: Math.hypot(point.x - start.x, point.z - start.z), closest };
            }
            const t = clampNumber(((point.x - start.x) * segX + (point.z - start.z) * segZ) / lenSq, 0, 1);
            const closest = new THREE.Vector3(start.x + segX * t, point.y, start.z + segZ * t);
            return { distance: Math.hypot(point.x - closest.x, point.z - closest.z), closest };
        }

        function sanitizeTrackProp(prop, gateLayout) {
            if (!prop || !Array.isArray(gateLayout) || gateLayout.length < 2) return prop;
            const moved = { ...prop, position: [...prop.position], size: [...prop.size] };
            const point = new THREE.Vector3(moved.position[0], moved.position[1], moved.position[2]);
            const radius = getPropFootprintRadius(moved);
            const heightHalf = getPropHeightHalf(moved);
            for (let pass = 0; pass < 6; pass++) {
                let changed = false;
                for (const gate of gateLayout) {
                    const dx = point.x - gate.posVec.x;
                    const dz = point.z - gate.posVec.z;
                    const horizontalDistance = Math.hypot(dx, dz);
                    const verticalDistance = Math.abs(point.y - gate.posVec.y);
                    const clearance = 12 + radius * 0.65;
                    const verticalClearance = heightHalf + 7;
                    if (horizontalDistance >= clearance || verticalDistance >= verticalClearance) continue;
                    const push = horizontalDistance > 0.001
                        ? new THREE.Vector3(dx / horizontalDistance, 0, dz / horizontalDistance)
                        : new THREE.Vector3(Math.cos(gate.rotEuler.y), 0, -Math.sin(gate.rotEuler.y));
                    point.addScaledVector(push, clearance - horizontalDistance + 3);
                    changed = true;
                }
                if (changed) continue;
                let nearest = null;
                for (let i = 0; i < gateLayout.length - 1; i++) {
                    const start = gateLayout[i].posVec;
                    const end = gateLayout[i + 1].posVec;
                    const segmentY = (start.y + end.y) * 0.5;
                    if (Math.abs(point.y - segmentY) > heightHalf + 5) continue;
                    const hit = distancePointToSegmentXZ(point, start, end);
                    const clearance = 8 + radius * 0.45;
                    if (hit.distance >= clearance) continue;
                    if (!nearest || hit.distance < nearest.distance) nearest = { ...hit, start, end, clearance };
                }
                if (!nearest) break;
                const segDir = nearest.end.clone().sub(nearest.start).setY(0);
                if (segDir.lengthSq() < 0.0001) break;
                segDir.normalize();
                const normal = new THREE.Vector3(-segDir.z, 0, segDir.x);
                const toward = point.clone().sub(nearest.closest).setY(0);
                if (toward.lengthSq() > 0.0001 && toward.dot(normal) < 0) normal.multiplyScalar(-1);
                point.addScaledVector(normal, nearest.clearance - nearest.distance + 3);
            }
            moved.position = [Number(point.x.toFixed(2)), moved.position[1], Number(point.z.toFixed(2))];
            return moved;
        }

        function createTrackVariant(themeIndex, layoutIndex, layout = null) {
            const isCompact = !!layout?.compact;
            if (isCompact) {
                return {
                    rotation: (themeIndex * 90 + layoutIndex * 19) % 360,
                    scale: 0.86 + (layoutIndex % 2) * 0.05,
                    heightScale: 1 + ((layoutIndex + themeIndex) % 2) * 0.04,
                    lift: themeIndex === 1 ? 2 : 0,
                    offset: [((layoutIndex % 2) * 8) - 4, 0, ((layoutIndex % 3) - 1) * 6]
                };
            }
            return {
                rotation: (themeIndex * 90 + layoutIndex * 17) % 360,
                scale: 0.94 + (layoutIndex % 3) * 0.08,
                heightScale: 1 + ((layoutIndex + themeIndex) % 2) * 0.08,
                lift: themeIndex === 1 ? 4 + (layoutIndex % 2) * 2 : (themeIndex === 3 ? 2 : 0),
                offset: [((layoutIndex % 2) * 14) - 7, 0, ((layoutIndex % 3) - 1) * 10]
            };
        }

        const TRACKS = COURSE_THEME_GROUPS.flatMap((themeGroup, themeIndex) =>
            Object.keys(COURSE_LAYOUTS).map((layoutKey, layoutIndex) => {
                const layout = COURSE_LAYOUTS[layoutKey];
                const transform = createTrackVariant(themeIndex, layoutIndex, layout);
                const gatePoints = layout.gates.map(point => new THREE.Vector3(...transformPoint(point, transform)));
                const gateLayout = buildGateLayout(gatePoints);
                const props = layout.props
                    .map(prop => ({
                        ...prop,
                        position: transformPoint(prop.position, transform),
                        size: transformSize(prop.size, transform),
                        rotation: (prop.rotation || 0) + (transform.rotation || 0)
                    }))
                    .map(prop => sanitizeTrackProp(prop, gateLayout));

                return {
                    id: themeIndex * Object.keys(COURSE_LAYOUTS).length + layoutIndex + 1,
                    name: themeGroup.names[layoutIndex],
                    terrain: themeGroup.terrain,
                    gates: gateLayout.length,
                    lengthMeters: getTrackLengthMeters(gateLayout),
                    profile: layout.profile,
                    difficulty: layout.difficulty,
                    tagline: layout.tagline,
                    gateLayout,
                    props,
                    spawnDistance: layout.compact ? 12 + (layoutIndex % 2) * 2 : 24 + (layoutIndex % 3) * 4,
                    compact: !!layout.compact
                };
            })
        );

        const BEST_TIME_COOKIE_NAME = 'xnh_best_times';
        const LAP_DATA_STORAGE_KEY = 'xnh_lap_data_v1';
        const MAX_LEADERBOARD_ENTRIES = 10;
        const DEFAULT_SECTOR_COUNT = 3;

        function readCookieValue(name) {
            const prefix = `${name}=`;
            const entry = document.cookie.split('; ').find(row => row.startsWith(prefix));
            return entry ? decodeURIComponent(entry.slice(prefix.length)) : '';
        }

        function loadBestTimesFromCookie() {
            try {
                const raw = readCookieValue(BEST_TIME_COOKIE_NAME);
                if (!raw) return {};
                const parsed = JSON.parse(raw);
                return Object.fromEntries(
                    Object.entries(parsed).filter(([trackId, value]) => typeof trackId === 'string' && Number.isFinite(value))
                );
            } catch (err) {
                return {};
            }
        }

        function getEmptyLapDataStore() {
            return { leaderboards: {}, sectorBests: {}, ghosts: {} };
        }

        function readLocalStorageValue(key) {
            try {
                return window.localStorage ? window.localStorage.getItem(key) : null;
            } catch (err) {
                return null;
            }
        }

        function writeLocalStorageValue(key, value) {
            try {
                if (!window.localStorage) return false;
                window.localStorage.setItem(key, value);
                return true;
            } catch (err) {
                return false;
            }
        }

        function normalizeLapRecord(record) {
            if (!record || !Array.isArray(record.samples)) return null;
            const samples = record.samples
                .map(sample => Array.isArray(sample) ? sample.slice(0, 8).map(Number) : null)
                .filter(sample => sample && sample.length === 8 && sample.every(Number.isFinite));
            if (samples.length < 2) return null;
            return {
                duration: Number.isFinite(record.duration) ? Number(record.duration) : samples[samples.length - 1][0],
                sectors: Array.isArray(record.sectors) ? record.sectors.filter(Number.isFinite).map(value => Number(value)) : [],
                samples
            };
        }

        function loadLapDataStore() {
            try {
                const raw = readLocalStorageValue(LAP_DATA_STORAGE_KEY);
                if (!raw) return getEmptyLapDataStore();
                const parsed = JSON.parse(raw);
                const store = getEmptyLapDataStore();
                if (parsed?.leaderboards && typeof parsed.leaderboards === 'object') {
                    Object.entries(parsed.leaderboards).forEach(([key, value]) => {
                        if (!Array.isArray(value)) return;
                        store.leaderboards[key] = value.filter(Number.isFinite).map(item => Number(item)).sort((a, b) => a - b).slice(0, MAX_LEADERBOARD_ENTRIES);
                    });
                }
                if (parsed?.sectorBests && typeof parsed.sectorBests === 'object') {
                    Object.entries(parsed.sectorBests).forEach(([key, value]) => {
                        if (!Array.isArray(value)) return;
                        store.sectorBests[key] = value.filter(Number.isFinite).map(item => Number(item));
                    });
                }
                if (parsed?.ghosts && typeof parsed.ghosts === 'object') {
                    Object.entries(parsed.ghosts).forEach(([key, value]) => {
                        const normalized = normalizeLapRecord(value);
                        if (normalized) store.ghosts[key] = normalized;
                    });
                }
                return store;
            } catch (err) {
                return getEmptyLapDataStore();
            }
        }
        // タッチ対応PCへ仮想スティックを誤表示しないよう、UAと小画面・粗いポインターを併用する。
        const isMobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isSmallTouchScreen = (window.matchMedia?.('(pointer: coarse)')?.matches ?? false) && window.innerWidth < 1024;
        const prefersTouchControls = isMobileUA || isSmallTouchScreen;

        const state = {
            lang: 'EN',
            mode: 'MENU',
            isPaused: false,
            track: null,
            droneClassId: DEFAULT_DRONE_CLASS.id,
            droneId: DEFAULT_DRONE_ENTRY.id,
            terrain: CONSTANTS.TERRAINS.PLAINS,
            customStats: { speed: 50, agility: 4.0, weight: 1.0 },
            
            // Three.js座標系で保持する飛行物理状態。
            pos: new THREE.Vector3(0, 2, 0),
            quat: new THREE.Quaternion(),
            vel: new THREE.Vector3(),
            angVel: new THREE.Vector3(),
            throttleStick: 0,
            
            // レース・損傷・バッテリー・記録の進行状態。
            status: 'READY',
            startTime: 0,
            finishTime: 0,
            autoRestartTimer: 0,
            currentGate: 0,
            lapCount: 0,
            health: 100,
            battery: DEFAULT_DRONE_ENTRY.batteryMax,
            isCrashed: false,
            crashTimer: 0,
            maxSpeed: 0,
            crashCount: 0,
            lastImpactSound: 0,
            throttleLocked: false,

            settings: { volume: 0.4, videoQuality: 'TEXTURED', rate: 1.0, expo: 0.2, deadzone: 0.05, showInput: false, showCompass: true, showHorizon: true },
            bestTimes: loadBestTimesFromCookie(),
            
            // 前フレームのボタン状態を残し、押しっぱなしによる多重実行を防ぐ。
            lastControls: { throttle: 0, yaw: 0, pitch: 0, roll: 0 },
            btnState: {},
            menuIndex: 0,
            worldColliders: [],
            menuSceneTrack: null,
            menuCamera: { center: new THREE.Vector3(), radius: 140, height: 70 },
            selectStage: 'TRACKS',
            selectDroneConfirmed: false,
            mobile: {
                enabled: prefersTouchControls,
                left: { x: 0, y: 0, pointerId: null },
                right: { x: 0, y: 0, pointerId: null },
                resetPressed: false
            },
            gamepadCalibration: { active: false, axes: [0,0,0,0] }, // 未使用（キャリブレーション廃止）
            bannerHideTimer: null,
            detailPanelOpen: false,
            detailPanelCollapsed: false,
            detailPanelKind: 'TRACK',
            detailTrackId: null,
            detailDroneClassId: null,
            detailDroneId: null,
            lapData: loadLapDataStore(),
            sectorGateIndices: [],
            sectorTimes: [],
            sectorIndex: 0,
            sectorDelta: null,
            sectorFlashTimer: 0,
            timePenaltySeconds: 0,
            lapSamples: [],
            lapSampleTimer: 0,
            lastLapRecord: null,
            ghostRecord: null,
            replayMode: false,
            replayRecord: null,
            replaySource: 'BEST',
            replayTime: 0,
            respawnCooldown: 0,
            rankLastLap: null,
            ghostVisuals: { line: null, marker: null }
        };

        function persistBestTimesCookie() {
            document.cookie = `${BEST_TIME_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(state.bestTimes))}; path=/; max-age=31536000; samesite=lax`;
        }

        function persistLapDataStore() {
            writeLocalStorageValue(LAP_DATA_STORAGE_KEY, JSON.stringify(state.lapData));
        }

        function getLapDataKey(trackId, droneClassId = state.droneClassId) {
            return getBestTimeKey(trackId, droneClassId);
        }

        function getLeaderboard(trackId, droneClassId = state.droneClassId) {
            const key = getLapDataKey(trackId, droneClassId);
            if (!key) return [];
            return Array.isArray(state.lapData.leaderboards[key]) ? state.lapData.leaderboards[key] : [];
        }

        function getSectorBests(trackId, droneClassId = state.droneClassId) {
            const key = getLapDataKey(trackId, droneClassId);
            if (!key) return [];
            return Array.isArray(state.lapData.sectorBests[key]) ? state.lapData.sectorBests[key] : [];
        }

        function getGhostRecord(trackId, droneClassId = state.droneClassId) {
            const key = getLapDataKey(trackId, droneClassId);
            if (!key) return null;
            return state.lapData.ghosts[key] || null;
        }

        function updateLapData(trackId, lapSeconds, droneClassId, sectorTimes = [], lapRecord = null) {
            const key = getLapDataKey(trackId, droneClassId);
            if (!key || !Number.isFinite(lapSeconds)) return { rank: null, leaderboard: [], sectorBests: [], ghostSaved: false };
            const leaderboard = [...getLeaderboard(trackId, droneClassId), Number(lapSeconds.toFixed(3))].sort((a, b) => a - b);
            const rank = leaderboard.indexOf(Number(lapSeconds.toFixed(3))) + 1;
            state.lapData.leaderboards[key] = leaderboard.slice(0, MAX_LEADERBOARD_ENTRIES);

            const sectorBest = getSectorBests(trackId, droneClassId).slice();
            sectorTimes.forEach((value, index) => {
                if (!Number.isFinite(value)) return;
                sectorBest[index] = Number.isFinite(sectorBest[index]) ? Math.min(sectorBest[index], value) : value;
            });
            state.lapData.sectorBests[key] = sectorBest.map(value => Number(value.toFixed(3)));

            let ghostSaved = false;
            const currentBest = getGhostRecord(trackId, droneClassId);
            if (lapRecord && (!currentBest || lapSeconds <= currentBest.duration)) {
                state.lapData.ghosts[key] = lapRecord;
                ghostSaved = true;
            }

            persistLapDataStore();
            return { rank, leaderboard: state.lapData.leaderboards[key], sectorBests: state.lapData.sectorBests[key], ghostSaved };
        }

        function formatDelta(seconds) {
            if (!Number.isFinite(seconds)) return '--';
            const sign = seconds > 0.005 ? '+' : seconds < -0.005 ? '-' : '±';
            return `${sign}${Math.abs(seconds).toFixed(2)}s`;
        }

        function getCurrentLapTimeSeconds() {
            if (!state.startTime) return 0;
            return (Date.now() - state.startTime) / 1000 + state.timePenaltySeconds;
        }

        function getSectorGateIndices(track) {
            const gateCount = Math.max(1, track?.gates || track?.gateLayout?.length || 1);
            const boundaries = [];
            let previous = 0;
            for (let i = 1; i <= DEFAULT_SECTOR_COUNT; i++) {
                const target = i === DEFAULT_SECTOR_COUNT
                    ? gateCount
                    : Math.max(previous + 1, Math.round((gateCount * i) / DEFAULT_SECTOR_COUNT));
                boundaries.push(Math.min(gateCount, target));
                previous = boundaries[boundaries.length - 1];
            }
            return boundaries;
        }

        function buildLapRecord(samples, sectorTimes, lapSeconds) {
            if (!Array.isArray(samples) || samples.length < 2 || !Number.isFinite(lapSeconds)) return null;
            return normalizeLapRecord({
                duration: Number(lapSeconds.toFixed(3)),
                sectors: sectorTimes.filter(Number.isFinite).map(value => Number(value.toFixed(3))),
                samples
            });
        }

        function sampleLapRecord(record, timeSeconds) {
            if (!record || !Array.isArray(record.samples) || record.samples.length < 2) return null;
            const target = Math.max(0, Math.min(timeSeconds, record.duration));
            const samples = record.samples;
            let upperIndex = samples.findIndex(sample => sample[0] >= target);
            if (upperIndex <= 0) upperIndex = 1;
            if (upperIndex < 0) upperIndex = samples.length - 1;
            const prev = samples[upperIndex - 1];
            const next = samples[upperIndex];
            const span = Math.max(0.0001, next[0] - prev[0]);
            const alpha = Math.max(0, Math.min(1, (target - prev[0]) / span));
            const pos = new THREE.Vector3(
                THREE.MathUtils.lerp(prev[1], next[1], alpha),
                THREE.MathUtils.lerp(prev[2], next[2], alpha),
                THREE.MathUtils.lerp(prev[3], next[3], alpha)
            );
            const quat = new THREE.Quaternion(prev[4], prev[5], prev[6], prev[7]).slerp(
                new THREE.Quaternion(next[4], next[5], next[6], next[7]),
                alpha
            );
            return { pos, quat };
        }

        function captureLapSample(force = false) {
            if (state.mode !== 'TIME_ATTACK' || state.status !== 'RUNNING' || state.replayMode) return;
            const now = getCurrentLapTimeSeconds();
            if (!force && state.lapSampleTimer < 0.08) return;
            state.lapSampleTimer = 0;
            state.lapSamples.push([
                Number(now.toFixed(3)),
                Number(state.pos.x.toFixed(3)),
                Number(state.pos.y.toFixed(3)),
                Number(state.pos.z.toFixed(3)),
                Number(state.quat.x.toFixed(5)),
                Number(state.quat.y.toFixed(5)),
                Number(state.quat.z.toFixed(5)),
                Number(state.quat.w.toFixed(5))
            ]);
            if (state.lapSamples.length > 900) state.lapSamples.shift();
        }

        function resetLapRuntimeState() {
            state.sectorGateIndices = state.track ? getSectorGateIndices(state.track) : [];
            state.sectorTimes = [];
            state.sectorIndex = 0;
            state.sectorDelta = null;
            state.sectorFlashTimer = 0;
            state.timePenaltySeconds = 0;
            state.lapSamples = [];
            state.lapSampleTimer = 0;
            state.lastLapRecord = null;
            state.ghostRecord = state.track ? getGhostRecord(state.track.id, state.droneClassId) : null;
        }

        function renderLeaderboardPanel(trackId, droneClassId, emptyLabel = 'No laps recorded yet.') {
            const rows = getLeaderboard(trackId, droneClassId).slice(0, 3);
            if (!rows.length) return `<div class="text-gray-500">${emptyLabel}</div>`;
            return rows.map((value, index) => `<div class="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2"><span class="text-gray-500">#${index + 1}</span><span class="text-white font-mono">${formatTime(value)}</span></div>`).join('');
        }
        function getBestTimeKey(trackId, droneClassId = state.droneClassId) {
            if (!trackId || !droneClassId) return null;
            return `${trackId}::${droneClassId}`;
        }

        function getBestTime(trackId, droneClassId = state.droneClassId) {
            const key = getBestTimeKey(trackId, droneClassId);
            if (!key) return null;
            const value = state.bestTimes[key];
            return Number.isFinite(value) ? value : null;
        }

        function formatTime(seconds) {
            return Number.isFinite(seconds) ? `${seconds.toFixed(2)}s` : '--';
        }


        function getLoadedBatteryVoltage(stats, storedVoltage, throttle = 0, speed = 0) {
            if (!stats) return storedVoltage;
            const clampedVoltage = clampNumber(storedVoltage, stats.batteryMin, stats.batteryMax);
            const throttleLoad = Math.pow(clampNumber(throttle, 0, 1), 1.35);
            const speedLoad = clampNumber(speed / Math.max(12, stats.speed * 0.55), 0, 1);
            const batterySpan = Math.max(0.4, stats.batteryMax - stats.batteryMin);
            const sagCeiling = clampNumber(batterySpan * 0.38 + stats.massKg * 0.28 + stats.batteryNominal * 0.015, 0.1, batterySpan * 0.72);
            const sag = sagCeiling * clampNumber(throttleLoad * 0.82 + speedLoad * 0.18, 0, 1);
            return Math.max(stats.batteryMin, clampedVoltage - sag);
        }
        function getRaceBannerText(kind, payload = {}) {
            const lapTime = formatTime(payload.lapTime);
            const bestTime = formatTime(payload.bestTime);
            const lapLabel = Number.isFinite(payload.lapCount) ? payload.lapCount : state.lapCount;
            if (state.lang === 'JP') {
                if (kind === 'finish-new-record') return { title: `LAP ${lapLabel} BEST`, sub: `Lap ${lapTime}  BEST ${bestTime}` };
                if (kind === 'finish') return { title: `LAP ${lapLabel} COMPLETE`, sub: `Lap ${lapTime}  BEST ${bestTime}` };
                return { title: 'TIME ATTACK', sub: '最初のゲートを通過してラップをつなげよう。' };
            }
            if (kind === 'finish-new-record') return { title: `LAP ${lapLabel} NEW RECORD`, sub: `Lap ${lapTime}  BEST ${bestTime}` };
            if (kind === 'finish') return { title: `LAP ${lapLabel} COMPLETE`, sub: `Lap ${lapTime}  BEST ${bestTime}` };
            return { title: 'TIME ATTACK', sub: 'Fly through the first gate and keep the laps flowing.' };
        }

        function setMissionBanner(title, sub, visible = true) {
            const box = document.getElementById('mission-start-msg');
            const titleEl = document.getElementById('txt-mission-title');
            const subEl = document.getElementById('txt-mission-sub');
            if (titleEl) titleEl.textContent = title;
            if (subEl) subEl.textContent = sub;
            if (!box) return;
            box.classList.toggle('hidden', !visible);
            box.classList.toggle('opacity-0', !visible);
        }

        function scheduleMissionBannerHide(delay = 1600) {
            if (state.bannerHideTimer) clearTimeout(state.bannerHideTimer);
            state.bannerHideTimer = setTimeout(() => {
                state.bannerHideTimer = null;
                setMissionBanner('', '', false);
            }, delay);
        }

        function restoreMissionBanner(visible = true) {
            if (state.bannerHideTimer) {
                clearTimeout(state.bannerHideTimer);
                state.bannerHideTimer = null;
            }
            const text = getRaceBannerText('ready');
            setMissionBanner(text.title, text.sub, visible);
        }

        function completeTimeAttackLap() {
            captureLapSample(true);
            syncSectorProgress(true);
            state.finishTime = getCurrentLapTimeSeconds();
            state.lastLapRecord = buildLapRecord(state.lapSamples, state.sectorTimes, state.finishTime);
            state.lapCount += 1;
            const bestResult = updateBestTime(state.track?.id, state.finishTime, state.droneClassId);
            const lapDataResult = updateLapData(state.track?.id, state.finishTime, state.droneClassId, state.sectorTimes, bestResult.isNew ? state.lastLapRecord : null);
            state.rankLastLap = lapDataResult.rank;
            if (lapDataResult.ghostSaved) refreshGhostRecord();
            audio.playSE('finish');
            const finishTimeEl = document.getElementById('finish-time');
            if (finishTimeEl) finishTimeEl.textContent = formatTime(state.finishTime);
            const finishBestEl = document.getElementById('finish-best');
            if (finishBestEl) finishBestEl.textContent = bestResult.isNew
                ? `NEW RECORD / BEST ${formatTime(bestResult.best)}`
                : `BEST ${formatTime(bestResult.best)}`;
            const msEl = document.getElementById('finish-maxspeed');
            if (msEl) msEl.textContent = state.maxSpeed.toFixed(1) + ' m/s';
            const crEl = document.getElementById('finish-crashes');
            if (crEl) crEl.textContent = state.crashCount + (state.crashCount === 1 ? ' crash' : ' crashes');
            const rankEl = document.getElementById('finish-rank');
            if (rankEl) rankEl.textContent = state.rankLastLap ? `#${state.rankLastLap}` : '--';
            const replayLabelEl = document.getElementById('finish-replay-label');
            if (replayLabelEl) replayLabelEl.textContent = state.lastLapRecord ? 'Last / Best Ready' : 'Best Ghost';
            renderFinishSectors(state.sectorTimes, getSectorBests(state.track?.id, state.droneClassId));
            const banner = getRaceBannerText(bestResult.isNew ? 'finish-new-record' : 'finish', {
                lapTime: state.finishTime,
                bestTime: bestResult.best,
                lapCount: state.lapCount
            });
            setMissionBanner(banner.title, `${banner.sub}  RANK #${state.rankLastLap || '--'}`, true);
            scheduleMissionBannerHide();
            state.startTime = Date.now();
            state.currentGate = 0;
            state.status = 'RUNNING';
            state.sectorTimes = [];
            state.sectorIndex = 0;
            state.sectorDelta = null;
            state.sectorFlashTimer = 0;
            state.timePenaltySeconds = 0;
            state.lapSamples = [];
            state.lapSampleTimer = 0;
            rebuildGates();
            captureLapSample(true);
        }

        function updateBestTime(trackId, seconds, droneClassId = state.droneClassId) {
            const key = getBestTimeKey(trackId, droneClassId);
            if (!key || !Number.isFinite(seconds)) return { best: getBestTime(trackId, droneClassId), isNew: false };
            const previous = getBestTime(trackId, droneClassId);
            if (previous === null || seconds < previous) {
                const normalized = Number(seconds.toFixed(3));
                state.bestTimes[key] = normalized;
                persistBestTimesCookie();
                return { best: normalized, previous, isNew: true };
            }
            return { best: previous, previous, isNew: false };
        }

        function clearGhostVisuals() {
            while (ghostGroup.children.length) {
                const child = ghostGroup.children.pop();
                ghostGroup.remove(child);
                child.geometry?.dispose?.();
                disposeMaterial(child.material);
            }
            state.ghostVisuals.line = null;
            state.ghostVisuals.marker = null;
        }

        function rebuildGhostVisuals() {
            clearGhostVisuals();
            const record = state.ghostRecord;
            if (!record || !Array.isArray(record.samples) || record.samples.length < 2) return;
            const positions = [];
            record.samples.forEach((sample, index) => {
                if (index % 2 !== 0 && index !== record.samples.length - 1) return;
                positions.push(sample[1], sample[2], sample[3]);
            });
            const lineGeometry = new THREE.BufferGeometry();
            lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            const line = new THREE.Line(
                lineGeometry,
                new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.28, depthWrite: false })
            );
            const marker = new THREE.Mesh(
                new THREE.SphereGeometry(0.72, 14, 14),
                new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x164e63, transparent: true, opacity: 0.42, roughness: 0.25, metalness: 0.1 })
            );
            marker.castShadow = false;
            marker.receiveShadow = false;
            ghostGroup.add(line);
            ghostGroup.add(marker);
            state.ghostVisuals.line = line;
            state.ghostVisuals.marker = marker;
            updateGhostVisuals();
        }

        function updateGhostVisuals() {
            const marker = state.ghostVisuals.marker;
            if (!marker || !state.ghostRecord) return;
            if (state.replayMode) {
                marker.visible = false;
                return;
            }
            const lapTime = state.mode === 'TIME_ATTACK' && state.status === 'RUNNING' ? getCurrentLapTimeSeconds() : 0;
            const pose = sampleLapRecord(state.ghostRecord, lapTime % Math.max(state.ghostRecord.duration, 0.001));
            marker.visible = !!pose;
            if (!pose) return;
            marker.position.copy(pose.pos);
            marker.quaternion.copy(pose.quat);
        }

        function refreshGhostRecord() {
            state.ghostRecord = state.track ? getGhostRecord(state.track.id, state.droneClassId) : null;
            rebuildGhostVisuals();
        }

        function syncSectorProgress(forceAll = false) {
            if (state.mode !== 'TIME_ATTACK' || !state.track) return;
            while (state.sectorIndex < state.sectorGateIndices.length) {
                const boundary = state.sectorGateIndices[state.sectorIndex];
                const reached = forceAll ? true : (state.currentGate >= boundary && boundary < state.gates.length);
                if (!reached) break;
                const elapsed = getCurrentLapTimeSeconds();
                const previous = state.sectorTimes.reduce((sum, value) => sum + value, 0);
                const sectorTime = Math.max(0, elapsed - previous);
                state.sectorTimes[state.sectorIndex] = Number(sectorTime.toFixed(3));
                const bestSector = getSectorBests(state.track.id, state.droneClassId)[state.sectorIndex];
                state.sectorDelta = Number.isFinite(bestSector) ? Number((sectorTime - bestSector).toFixed(3)) : null;
                state.sectorFlashTimer = 1.4;
                state.sectorIndex += 1;
            }
        }

        function renderFinishSectors(sectors = [], bests = []) {
            const el = document.getElementById('finish-sectors');
            if (!el) return;
            el.innerHTML = '';
            for (let i = 0; i < DEFAULT_SECTOR_COUNT; i++) {
                const sector = sectors[i];
                const best = bests[i];
                const delta = Number.isFinite(sector) && Number.isFinite(best) ? sector - best : null;
                const tone = !Number.isFinite(delta) ? 'text-gray-400 border-gray-700 bg-gray-900/40' : delta <= 0.005 ? 'text-emerald-300 border-emerald-500/30 bg-emerald-900/20' : 'text-amber-300 border-amber-500/30 bg-amber-900/20';
                const card = document.createElement('div');
                card.className = `rounded-lg border ${tone} px-3 py-2`;
                card.innerHTML = `<div class="text-[10px] uppercase tracking-[0.2em] text-gray-500">S${i + 1}</div><div class="mt-1 text-sm text-white">${formatTime(sector)}</div><div class="mt-1 text-[10px]">${Number.isFinite(delta) ? formatDelta(delta) : 'Best --'}</div>`;
                el.appendChild(card);
            }
        }

        function getGateRespawnPose(gateIndex) {
            const gates = state.gates || state.track?.gateLayout;
            if (!gates?.length) return null;
            const safeIndex = Math.max(0, Math.min(gateIndex, gates.length - 1));
            const gate = gates[safeIndex];
            const prev = gates[Math.max(safeIndex - 1, 0)]?.posVec || gate.posVec.clone().add(new THREE.Vector3(0, 0, -1));
            const next = gates[Math.min(safeIndex + 1, gates.length - 1)]?.posVec || gate.posVec.clone().add(new THREE.Vector3(0, 0, 1));
            let heading = safeIndex === 0 ? next.clone().sub(gate.posVec) : gate.posVec.clone().sub(prev);
            heading.setY(0);
            if (heading.lengthSq() < 0.001) heading = next.clone().sub(gate.posVec).setY(0);
            if (heading.lengthSq() < 0.001) heading.set(0, 0, 1);
            heading.normalize();
            const spawn = gate.posVec.clone().sub(heading.clone().multiplyScalar(8));
            spawn.y = Math.max(getTerrainHeight(spawn.x, spawn.z, state.terrain) + 1.8, gate.posVec.y - 1.2);
            const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), heading);
            return { spawn, quat };
        }

        function respawnAtCurrentGate(penaltySeconds = 1.2) {
            const pose = getGateRespawnPose(state.mode === 'TIME_ATTACK' ? state.currentGate : 0);
            if (!pose) {
                resetRace();
                return;
            }
            state.isCrashed = false;
            state.crashTimer = 0;
            state.health = Math.max(68, state.health || 0);
            state.pos.copy(pose.spawn);
            state.quat.copy(pose.quat);
            state.vel.set(0, 0, 0);
            state.angVel.set(0, 0, 0);
            state.throttleStick = 0;
            state.throttleLocked = false;
            state.respawnCooldown = 0.35;
            if (state.mode === 'TIME_ATTACK') state.timePenaltySeconds += penaltySeconds;
            rebuildGates();
        }

        function startReplay(record = state.lastLapRecord || state.ghostRecord, source = state.lastLapRecord ? 'LAST' : 'BEST') {
            if (!record || state.mode !== 'TIME_ATTACK') return;
            state.replayMode = true;
            state.replayRecord = record;
            state.replaySource = source;
            state.replayTime = 0;
            state.isPaused = false;
            state.status = 'REPLAY';
            document.getElementById('popup-finish').classList.add('hidden');
        }

        function stopReplay(showFinishPopup = false) {
            state.replayMode = false;
            state.replayRecord = null;
            state.replayTime = 0;
            state.status = 'READY';
            if (showFinishPopup) {
                document.getElementById('popup-finish').classList.remove('hidden');
                updateGhostVisuals();
                return;
            }
            resetRace();
        }

        function updateReplay(dt) {
            const record = state.replayRecord;
            if (!record) {
                stopReplay(false);
                return;
            }
            state.replayTime = Math.min(record.duration, state.replayTime + dt);
            const pose = sampleLapRecord(record, state.replayTime);
            if (pose) {
                state.pos.copy(pose.pos);
                state.quat.copy(pose.quat);
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.quat).normalize();
                const chasePos = state.pos.clone().add(forward.clone().multiplyScalar(-7.5)).add(new THREE.Vector3(0, 2.4, 0));
                camera.position.copy(chasePos);
                camera.lookAt(state.pos.clone().add(forward.clone().multiplyScalar(10)));
            }
            if (state.replayTime >= record.duration - 0.0001) stopReplay(false);
        }
        // --- HELPER: Terrain Height ---
        function getTerrainHeight(x, y, type) {
            const activeTrack = ['TIME_ATTACK', 'OPEN_WORLD'].includes(state.mode) ? state.track : (state.mode === 'MENU' ? state.menuSceneTrack : null);
            if (activeTrack) {
                if (type === CONSTANTS.TERRAINS.STADIUM) {
                    const edge = Math.max(Math.abs(x), Math.abs(y));
                    return edge > 230 ? Math.min(28, (edge - 230) * 0.18) : 0;
                }
                if (type === CONSTANTS.TERRAINS.RUINS) {
                    return Math.sin(x * 0.015) * 1.2 + Math.cos(y * 0.015) * 1.2;
                }
                if (type === CONSTANTS.TERRAINS.MOUNTAINS) {
                    const ridge = Math.max(0, Math.abs(x) - 170) * 0.12 + Math.max(0, Math.abs(y) - 170) * 0.12;
                    return ridge + Math.sin((x + y) * 0.01) * 1.4;
                }
                return Math.sin(x * 0.01) * 1.4 + Math.cos(y * 0.01) * 1.4;
            }
            let h = 0;
            if (type === CONSTANTS.TERRAINS.MOUNTAINS) {
                h += Math.sin(x*0.01 + y*0.01)*20 + Math.sin(x*0.03)*10;
                const p = Math.max(0, Math.sin(x*0.005)+Math.cos(y*0.005));
                h += Math.pow(p, 4)*150;
            } else if (type === CONSTANTS.TERRAINS.RUINS) {
                h = Math.sin(x*0.05) + Math.cos(y*0.05);
            } else if (type === CONSTANTS.TERRAINS.STADIUM) {
                h = (Math.abs(x)>400 || Math.abs(y)>400) ? 50 : 0;
            } else {
                h += Math.sin(x*0.02)*5 + Math.cos(y*0.02)*5;
            }
            if (Math.sqrt(x*x+y*y) < 40) h *= (Math.sqrt(x*x+y*y)/40);
            return h;
        }

        // --- AUDIO ---
        const audio = {
            ctx: null, gain: null, osc1: null, osc2: null,
            init() {
                if (this.ctx) return;
                const AC = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AC();
                this.gain = this.ctx.createGain();
                this.gain.connect(this.ctx.destination);
                this.gain.gain.value = 0;
                
                const makeOsc = (detune) => {
                    const o = this.ctx.createOscillator();
                    o.type = 'sawtooth';
                    o.frequency.value = 60;
                    o.detune.value = detune;
                    o.connect(this.gain);
                    o.start();
                    return o;
                };
                this.osc1 = makeOsc(0);
                this.osc2 = makeOsc(15);
            },
            update(throt, speed) {
                if (!this.ctx) return;
                if (state.isPaused || state.mode === 'MENU') {
                    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
                    return;
                }
                const normalizedSpeed = Math.min(1, (speed || 0) / 28);
                // エンジン音は速度があると絞っても少し鳴り続ける
                const baseThrot = Math.max(throt, normalizedSpeed * 0.35);
                const vol = (baseThrot * 0.22 + normalizedSpeed * 0.05) * state.settings.volume;
                // 非線形でモーター回転感を出す
                const freq = 45 + Math.pow(Math.max(0, throt), 0.8) * 240 + normalizedSpeed * 160;
                this.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05);
                this.osc1.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.06);
                this.osc2.frequency.setTargetAtTime(freq * 1.007 + 12, this.ctx.currentTime, 0.06);
            },
            playSE(type) {
                if(!this.ctx || state.settings.volume <= 0) return;
                const now = this.ctx.currentTime;
                const vol = state.settings.volume * 0.5;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                
                if (type === 'checkpoint') {
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(1200, now);
                    osc.frequency.exponentialRampToValueAtTime(1800, now + 0.1);
                    gain.gain.setValueAtTime(vol, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                    osc.start(now);
                    osc.stop(now + 0.2);
                } else if (type === 'finish') {
                    osc.type = 'square';
                    [0, 0.15, 0.3].forEach((t, i) => {
                        const o = this.ctx.createOscillator();
                        const g = this.ctx.createGain();
                        o.connect(g); g.connect(this.ctx.destination);
                        const f = i===0?440: (i===1?554:659);
                        o.frequency.value = f;
                        g.gain.setValueAtTime(vol, now+t);
                        g.gain.exponentialRampToValueAtTime(0.01, now+t+0.5);
                        o.start(now+t); o.stop(now+t+0.5);
                    });
                } else if (type === 'crash') {
                    // 低音の激突音 → 崩壊音
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(200, now);
                    osc.frequency.exponentialRampToValueAtTime(22, now + 0.55);
                    gain.gain.setValueAtTime(vol * 1.6, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
                    osc.start(now); osc.stop(now + 0.6);
                    // 高音のスパーク音を重ねる
                    const osc2 = this.ctx.createOscillator();
                    const g2 = this.ctx.createGain();
                    osc2.connect(g2); g2.connect(this.ctx.destination);
                    osc2.type = 'square';
                    osc2.frequency.setValueAtTime(800, now);
                    osc2.frequency.exponentialRampToValueAtTime(60, now + 0.2);
                    g2.gain.setValueAtTime(vol * 0.6, now);
                    g2.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
                    osc2.start(now); osc2.stop(now + 0.25);
                } else if (type === 'impact') {
                    // 壁・地面の軽い衝突音
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(110, now);
                    osc.frequency.exponentialRampToValueAtTime(32, now + 0.22);
                    gain.gain.setValueAtTime(vol * 0.85, now);
                    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
                    osc.start(now); osc.stop(now + 0.28);
                }
            },
            resume() { 
                if(this.ctx?.state === 'suspended') this.ctx.resume();
                if(!this.ctx) this.init();
            }
        };

        // --- THREE.JS ---
        const container = document.getElementById('canvas-container');
        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x0c4a6e, 20, 500);

        const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambient);
        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(100, 200, 100);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048; 
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.top = 200; sun.shadow.camera.bottom = -200;
        sun.shadow.camera.left = -200; sun.shadow.camera.right = 200;
        scene.add(sun);

        const skyGeo = new THREE.BoxGeometry(1000, 1000, 1000);
        const skyMat = new THREE.MeshBasicMaterial({ color: 0x0c4a6e, side: THREE.BackSide });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        scene.add(sky);

        const worldGroup = new THREE.Group();
        scene.add(worldGroup);
        const ghostGroup = new THREE.Group();
        scene.add(ghostGroup);
        const textureCache = new Map();

        // --- INPUT & CONTROLS ---
        const keys = {};
        window.addEventListener('keydown', e => { keys[e.key] = true; if(e.key === 'Escape') togglePause(); audio.resume(); });
        window.addEventListener('keyup', e => keys[e.key] = false);
        window.addEventListener('click', () => audio.resume());

        function updateMobileThumb(side) {
            const stickEl = document.getElementById(`mobile-${side}-stick`);
            const thumbEl = document.getElementById(`mobile-${side}-thumb`);
            if (!stickEl || !thumbEl) return;
            const padRadius = stickEl.clientWidth * 0.5;
            const thumbRadius = thumbEl.clientWidth * 0.5;
            const travel = Math.max(0, padRadius - thumbRadius - 8);
            const data = state.mobile[side];
            thumbEl.style.transform = `translate(calc(-50% + ${data.x * travel}px), calc(-50% + ${-data.y * travel}px))`;
        }

        function resetMobileStick(side) {
            state.mobile[side].x = 0;
            state.mobile[side].y = 0;
            state.mobile[side].pointerId = null;
            updateMobileThumb(side);
        }

        function updateMobileStick(side, event) {
            const stickEl = document.getElementById(`mobile-${side}-stick`);
            if (!stickEl) return;
            const rect = stickEl.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = event.clientX - cx;
            const dy = event.clientY - cy;
            const maxRadius = rect.width * 0.5 - 16;
            const distance = Math.hypot(dx, dy);
            const scale = distance > maxRadius ? maxRadius / distance : 1;
            state.mobile[side].x = THREE.MathUtils.clamp((dx * scale) / maxRadius, -1, 1);
            state.mobile[side].y = THREE.MathUtils.clamp((-dy * scale) / maxRadius, -1, 1);
            updateMobileThumb(side);
        }

        function setupMobileControls() {
            ['left', 'right'].forEach(side => {
                const stickEl = document.getElementById(`mobile-${side}-stick`);
                if (!stickEl) return;

                stickEl.addEventListener('pointerdown', event => {
                    if (!state.mobile.enabled) return;
                    event.preventDefault();
                    audio.resume();
                    state.mobile[side].pointerId = event.pointerId;
                    stickEl.setPointerCapture(event.pointerId);
                    updateMobileStick(side, event);
                });

                stickEl.addEventListener('pointermove', event => {
                    if (state.mobile[side].pointerId !== event.pointerId) return;
                    event.preventDefault();
                    updateMobileStick(side, event);
                });

                const release = event => {
                    if (state.mobile[side].pointerId !== event.pointerId) return;
                    event.preventDefault();
                    resetMobileStick(side);
                };

                stickEl.addEventListener('pointerup', release);
                stickEl.addEventListener('pointercancel', release);
                stickEl.addEventListener('lostpointercapture', () => resetMobileStick(side));
            });

            const resetBtn = document.getElementById('mobile-btn-reset');
            if (resetBtn) {
                const setResetPressed = pressed => {
                    state.mobile.resetPressed = pressed;
                    resetBtn.classList.toggle('is-active', pressed);
                };
                resetBtn.addEventListener('pointerdown', event => {
                    event.preventDefault();
                    audio.resume();
                    setResetPressed(true);
                });
                ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => {
                    resetBtn.addEventListener(type, () => setResetPressed(false));
                });
            }

            const pauseBtn = document.getElementById('mobile-btn-pause');
            if (pauseBtn) {
                pauseBtn.addEventListener('pointerdown', event => {
                    event.preventDefault();
                    audio.resume();
                    pauseBtn.classList.add('is-active');
                    togglePause();
                });
                ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => {
                    pauseBtn.addEventListener(type, () => pauseBtn.classList.remove('is-active'));
                });
            }

            ['left', 'right'].forEach(updateMobileThumb);
        }


        function getControls() {
            // Gamepad配列には空きがあり得るため、index 0固定ではなく最初の接続済みを使う。
            const gp = Array.from(navigator.getGamepads()).find(g => g && g.connected) ?? null;
            let throt = 0, yaw = 0, pitch = 0, roll = 0, reset = false, respawn = false;

            if (isMenuInteractionActive()) {
                state.throttleStick = 0;
                return { throttle: 0, yaw: 0, pitch: 0, roll: 0, reset: false, respawn: false };
            }

            if (gp) {
                // 機種差で範囲外値や-1始まりの軸が来ても、操作値を必ず-1〜1へ収める。
                const padDz = Math.max(state.settings.deadzone, 0.15);
                const axis = i => Number.isFinite(gp.axes?.[i]) ? Math.max(-1, Math.min(1, gp.axes[i])) : 0;

                const leftX  = axis(0);
                const leftY  = axis(1);
                const rightX = axis(2);
                const rightY = axis(3);

                // スロットルだけは片方向0〜1へ変換し、姿勢軸のexpoを適用しない。
                const rawThrot = -leftY;
                throt = rawThrot < padDz ? 0 : (rawThrot - padDz) / (1 - padDz);

                yaw   = -leftX;   // left stick right → yaw right (CW)
                pitch =  rightY;  // right stick down → nose up
                roll  =  rightX;  // right stick right → roll right

                reset = gp.buttons[2]?.pressed; // X button
                respawn = gp.buttons[3]?.pressed; // Y button

                // Startボタンは立上り時だけ反応させる。
                if (gp.buttons[9]?.pressed && !state.btnState[9]) togglePause();
                state.btnState[9] = gp.buttons[9]?.pressed;

            } else if (state.mobile.enabled) {
                throt = Math.max(0, state.mobile.left.y);
                yaw = -state.mobile.left.x;
                pitch = -state.mobile.right.y;
                roll = state.mobile.right.x;
                reset = state.mobile.resetPressed;
            } else {
                if (keys['w'] || keys['W']) state.throttleStick = Math.min(1, state.throttleStick + 0.04);
                else state.throttleStick = 0; // W離したらスロットルオフ
                throt = state.throttleStick;
                
                if (keys['a'] || keys['A']) yaw = 1;
                if (keys['d'] || keys['D']) yaw = -1;
                if (keys['ArrowUp']) pitch = -1;
                if (keys['ArrowDown']) pitch = 1;
                if (keys['ArrowLeft']) roll = -1;
                if (keys['ArrowRight']) roll = 1;
                reset = keys['r'] || keys['R'];
                respawn = keys['g'] || keys['G'];
            }

            const batteryEmpty = state.battery <= getSelectedDroneStats().batteryMin;
            state.throttleLocked = state.isCrashed || state.health <= 1 || batteryEmpty;
            if (state.throttleLocked) {
                throt = 0;
                state.throttleStick = 0;
            }

            // 姿勢軸はデッドゾーン除去後に線形値と3次曲線を混合する。
            const dz = state.settings.deadzone;
            const apply = (v) => {
                if(Math.abs(v) < dz) return 0;
                const raw = (Math.abs(v) - dz) / (1 - dz);
                const curved = raw * (1 - state.settings.expo) + Math.pow(raw, 3) * state.settings.expo;
                return Math.sign(v) * curved * state.settings.rate;
            };

            return { throttle: throt, yaw: apply(yaw), pitch: apply(pitch), roll: apply(roll), reset, respawn };
        }

        // ゲームパッド操作時だけ、表示中の最前面画面へ仮想フォーカスを与える。
        function isMenuInteractionActive() {
            const isVisible = id => {
                const el = document.getElementById(id);
                return !!(el && !el.classList.contains('hidden'));
            };
            return state.mode === 'MENU'
                || state.mode === 'SELECT'
                || state.mode === 'FREE_SELECT'
                || state.isPaused
                || state.replayMode
                || isVisible('popup-settings')
                || isVisible('popup-pause')
                || isVisible('popup-finish');
        }

        function updateMenuNavigation() {
            // 飛行中はスティックを操縦へ専有し、一時停止中だけメニューへ戻す。
            if (['TIME_ATTACK', 'OPEN_WORLD'].includes(state.mode) && !state.isPaused) return;

            const gp = Array.from(navigator.getGamepads()).find(g => g && g.connected) ?? null;
            if (!gp) return;

            // 表示中の画面とポップアップから操作可能要素を抽出する。
            const visibleScreens = Array.from(document.querySelectorAll('.screen:not(.hidden), div[id^="popup-"]:not(.hidden)'));
            // DOM順で最後の表示要素を最前面ポップアップとして扱う。
            const activeContainer = visibleScreens[visibleScreens.length - 1];
            if (!activeContainer) return;

            const interactables = Array.from(activeContainer.querySelectorAll('button:not(:disabled), input[type="range"]'));
            if (interactables.length === 0) return;

            // D-padとスティックの連続入力は150ms間隔へ制限する。
            const now = Date.now();
            if (now - (state.lastMenuMove || 0) < 150) return;

            let move = 0;
            const menuAxis = index => {
                const value = gp.axes?.[index];
                return Number.isFinite(value) ? value : 0;
            };
            const menuThreshold = 0.6;
            // 左スティックとD-padを同じ移動操作へ割り当てる。
            if (menuAxis(1) < -menuThreshold || gp.buttons[12]?.pressed) move = -1; // Up
            if (menuAxis(1) > menuThreshold || gp.buttons[13]?.pressed) move = 1; // Down
            if (menuAxis(0) < -menuThreshold || gp.buttons[14]?.pressed) move = -1; // Left
            if (menuAxis(0) > menuThreshold || gp.buttons[15]?.pressed) move = 1; // Right

            if (move !== 0) {
                state.lastMenuMove = now;
                state.menuIndex += move;
                // 端を越えたら反対端へ循環する。
                if (state.menuIndex < 0) state.menuIndex = interactables.length - 1;
                if (state.menuIndex >= interactables.length) state.menuIndex = 0;
                
                // ネイティブfocusではなく、ゲーム用クラスで選択位置を表示する。
                interactables.forEach(el => el.classList.remove('btn-focus'));
                interactables[state.menuIndex].classList.add('btn-focus');
                interactables[state.menuIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            // Aボタンで現在項目をクリックする。
            if (gp.buttons[0]?.pressed && !state.btnState[0]) {
                state.btnState[0] = true;
                interactables[state.menuIndex].click();
            } else if (!gp.buttons[0]?.pressed) {
                state.btnState[0] = false;
            }

            // Bボタンは各画面に用意された戻る・閉じる操作へ寄せる。
            if (gp.buttons[1]?.pressed && !state.btnState[1]) {
                state.btnState[1] = true;
                // 画面ごとに異なる戻るボタンIDから、現在存在するものを選ぶ。
                const closeBtn = activeContainer.querySelector('#btn-back-menu, #btn-back-free, #btn-close-settings, #btn-quit, #btn-finish-menu');
                if (closeBtn) closeBtn.click();
            } else if (!gp.buttons[1]?.pressed) {
                state.btnState[1] = false;
            }
        }

        // 固定物理状態をdtで進め、描画フレームレート差を吸収する。
        function updatePhysics(dt) {
            if (state.isPaused) return;

            if (state.isCrashed) {
                state.crashTimer -= dt;
                state.angVel.x += (Math.random() - 0.5) * 20 * dt;
                state.angVel.z += (Math.random() - 0.5) * 20 * dt;
                state.angVel.multiplyScalar(Math.pow(0.90, dt * 60));
                const qStepC = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                    state.angVel.x * dt, state.angVel.y * dt, state.angVel.z * dt, 'YXZ'
                ));
                state.quat.multiply(qStepC);
                state.vel.add(new THREE.Vector3(0, -CONSTANTS.GRAVITY * 0.7, 0).multiplyScalar(dt));
                state.vel.multiplyScalar(Math.pow(0.88, dt * 60));
                state.pos.add(state.vel.clone().multiplyScalar(dt));
                const terrainHC = getTerrainHeight(state.pos.x, state.pos.z, state.terrain);
                if (state.pos.y < terrainHC + 0.5) {
                    state.pos.y = terrainHC + 0.5;
                    state.vel.set(0, 0, 0);
                }
                if (state.crashTimer <= 0) {
                    state.isCrashed = false;
                    respawnAtCurrentGate(1.4);
                }
                return;
            }

            const c = getControls();
            state.lastControls = c;
            state.respawnCooldown = Math.max(0, state.respawnCooldown - dt);
            state.lapSampleTimer += dt;
            if (c.reset) { resetRace(); return; }
            if (c.respawn && state.respawnCooldown <= 0) { respawnAtCurrentGate(1.0); return; }

            const stats = getSelectedDroneStats();
            const voltageDraw = (stats.batteryDrainBase + Math.pow(Math.max(0, c.throttle), 1.6) * stats.batteryDrainThrottle) * dt;
            state.battery = Math.max(stats.batteryMin, state.battery - voltageDraw);

            const loadedBatteryVoltage = getLoadedBatteryVoltage(stats, state.battery, c.throttle, state.vel.length());
            const batteryFactor = Math.max(0, Math.min(1, (loadedBatteryVoltage - stats.batteryMin) / Math.max(0.2, stats.batteryMax - stats.batteryMin)));

            const rs = stats.agility * 2.5;
            const targetAv = new THREE.Vector3(c.pitch * rs, c.yaw * rs, -c.roll * rs);
            const motorResp = stats.motorResponse || 11;
            state.angVel.lerp(targetAv, motorResp * dt);

            const angSpeed = state.angVel.length();
            if (c.throttle < 0.28 && angSpeed > 3.5) {
                const wash = (angSpeed - 3.5) * (0.28 - c.throttle) * 2.8;
                state.angVel.x += (Math.random() - 0.5) * wash * dt * 60;
                state.angVel.z += (Math.random() - 0.5) * wash * dt * 60;
            }

            const qStep = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                state.angVel.x * dt, state.angVel.y * dt, state.angVel.z * dt, 'YXZ'
            ));
            state.quat.multiply(qStep);

            const thrustCurve = Math.pow(Math.max(0, c.throttle), 1.65);
            const thrust = new THREE.Vector3(0, 1, 0).applyQuaternion(state.quat)
                .multiplyScalar(thrustCurve * stats.speed * 4.0 * dt * batteryFactor);

            const currentSpeed = state.vel.length();
            const dragCoeff = stats.drag || 0.0007;
            const dragFactor = Math.max(0, 1 - (dragCoeff * currentSpeed * currentSpeed + 0.003) * dt * 60);
            const grav = new THREE.Vector3(0, -CONSTANTS.GRAVITY * stats.weight, 0).multiplyScalar(dt);

            state.vel.multiplyScalar(dragFactor).add(thrust).add(grav);

            const newSpeed = state.vel.length();
            if (newSpeed > state.maxSpeed) state.maxSpeed = newSpeed;

            state.pos.add(state.vel.clone().multiplyScalar(dt));
            audio.update(c.throttle, newSpeed);

            const terrainH = getTerrainHeight(state.pos.x, state.pos.z, state.terrain);
            if (state.pos.y < terrainH + 0.5) {
                state.pos.y = terrainH + 0.5;
                const impact = Math.abs(state.vel.y);
                if (impact > 5) {
                    state.health = Math.max(0, state.health - impact * 1.2);
                    const now2 = Date.now();
                    if (now2 - state.lastImpactSound > 350) {
                        audio.playSE(impact > 12 ? 'crash' : 'impact');
                        state.lastImpactSound = now2;
                    }
                }
                state.vel.y *= -0.25;
                state.vel.multiplyScalar(0.72);
            }
            resolveWorldCollisions();

            if (state.health <= 0 && !state.isCrashed) {
                triggerCrash();
                return;
            }

            if (state.mode === 'TIME_ATTACK' && state.gates && state.currentGate < state.gates.length) {
                const g = state.gates[state.currentGate];
                if (state.pos.distanceTo(g.posVec) < 5) {
                    if (state.currentGate === 0 && state.status === 'READY') {
                        state.status = 'RUNNING';
                        state.startTime = Date.now();
                        state.timePenaltySeconds = 0;
                        state.lapSamples = [];
                        state.lapSampleTimer = 0;
                        captureLapSample(true);
                        document.getElementById('mission-start-msg').classList.add('opacity-0');
                        scheduleMissionBannerHide(600);
                    }
                    state.currentGate++;
                    audio.playSE('checkpoint');
                    if (state.currentGate >= state.gates.length) {
                        completeTimeAttackLap();
                        return;
                    }
                    syncSectorProgress(false);
                    rebuildGates();
                }
            }

            if (state.mode === 'TIME_ATTACK' && state.status === 'RUNNING') captureLapSample(false);
        }

        function triggerCrash() {
            state.isCrashed = true;
            state.crashTimer = 0.9;
            state.crashCount++;
            state.health = 0;
            state.vel.multiplyScalar(0.2);
            audio.playSE('crash');
        }

        // --- RENDER/WORLD ---
        function disposeMaterial(material) {
            if (Array.isArray(material)) material.forEach(m => m?.dispose?.());
            else material?.dispose?.();
        }

        function clearWorldObjects(filterFn = () => true) {
            Array.from(worldGroup.children).filter(filterFn).forEach(obj => {
                worldGroup.remove(obj);
                obj.traverse(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) disposeMaterial(child.material);
                });
            });
        }

        function setEnvironmentStyle(type, isTrackWorld) {
            const style = COURSE_STYLES[type] || COURSE_STYLES[CONSTANTS.TERRAINS.PLAINS];
            scene.fog.color.setHex(style.fog);
            scene.fog.near = isTrackWorld ? 28 : 20;
            scene.fog.far = isTrackWorld ? 640 : 500;
            sky.material.color.setHex(style.sky);
        }

        function getQualityDescription(quality) {
            if (quality === 'FLAT') return 'Flat: lowest cost shading with surface detail disabled.';
            if (quality === 'CINEMATIC') return 'Cinematic: denser procedural surface detail, higher pixel ratio, and full shadows.';
            return 'Textured: lightweight procedural surface detail with balanced shadows.';
        }

        function shadeHex(hex, factor) {
            const color = new THREE.Color(hex);
            if (factor >= 0) color.lerp(new THREE.Color(0xffffff), factor);
            else color.lerp(new THREE.Color(0x000000), Math.abs(factor));
            return `#${color.getHexString()}`;
        }

        function getProceduralTexture(key, createFn) {
            if (!textureCache.has(key)) textureCache.set(key, createFn());
            return textureCache.get(key);
        }

        const WORLD_Y_AXIS = new THREE.Vector3(0, 1, 0);

        function normalizeTextureKind(kind) {
            if (kind === 'ground') {
                return state.terrain === CONSTANTS.TERRAINS.STADIUM ? 'ground-tech' : 'ground-organic';
            }
            return kind || 'panel';
        }

        function createSurfaceTexture(baseColor, kind, quality) {
            const normalizedKind = normalizeTextureKind(kind);
            const size = quality === 'CINEMATIC' ? 128 : 64;
            const key = `${quality}:${normalizedKind}:${baseColor}`;
            return getProceduralTexture(key, () => {
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = baseColor;
                ctx.fillRect(0, 0, size, size);

                ctx.strokeStyle = shadeHex(baseColor, -0.16);
                ctx.fillStyle = shadeHex(baseColor, 0.12);
                ctx.lineWidth = Math.max(1, size / 32);

                if (normalizedKind === 'ground-organic') {
                    for (let y = 0; y < size; y += size / 8) {
                        ctx.fillStyle = y % (size / 4) === 0 ? shadeHex(baseColor, 0.08) : shadeHex(baseColor, -0.05);
                        ctx.fillRect(0, y, size, size / 10);
                    }
                    for (let i = 0; i < size * 0.35; i++) {
                        ctx.fillStyle = i % 2 === 0 ? shadeHex(baseColor, -0.18) : shadeHex(baseColor, 0.16);
                        ctx.fillRect((i * 17) % size, (i * 29) % size, 2, 2);
                    }
                } else if (normalizedKind === 'ground-tech') {
                    ctx.fillStyle = shadeHex(baseColor, -0.1);
                    ctx.fillRect(0, 0, size, size);
                    ctx.strokeStyle = shadeHex(baseColor, 0.22);
                    ctx.lineWidth = Math.max(1, size / 24);
                    for (let x = 0; x <= size; x += size / 8) {
                        ctx.beginPath();
                        ctx.moveTo(x, 0);
                        ctx.lineTo(x, size);
                        ctx.stroke();
                    }
                    for (let y = 0; y <= size; y += size / 8) {
                        ctx.beginPath();
                        ctx.moveTo(0, y);
                        ctx.lineTo(size, y);
                        ctx.stroke();
                    }
                    ctx.strokeStyle = shadeHex(baseColor, 0.32);
                    for (let i = 0; i < size; i += size / 4) {
                        ctx.strokeRect(i + 1, i + 1, size / 4 - 2, size / 4 - 2);
                    }
                } else if (normalizedKind === 'trim') {
                    ctx.fillStyle = shadeHex(baseColor, 0.18);
                    for (let x = 0; x < size; x += size / 6) ctx.fillRect(x, 0, size / 12, size);
                } else if (normalizedKind === 'support') {
                    for (let x = 0; x < size; x += size / 5) {
                        ctx.beginPath();
                        ctx.moveTo(x, 0);
                        ctx.lineTo(x + size / 6, size);
                        ctx.stroke();
                    }
                } else {
                    for (let y = 0; y < size; y += size / 4) {
                        for (let x = 0; x < size; x += size / 4) {
                            ctx.strokeRect(x + 1, y + 1, size / 4 - 2, size / 4 - 2);
                        }
                    }
                }

                const texture = new THREE.CanvasTexture(canvas);
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.anisotropy = quality === 'CINEMATIC' ? 8 : 2;
                texture.colorSpace = THREE.SRGBColorSpace;
                return texture;
            });
        }

        function configureRendererForQuality() {
            const quality = state.settings.videoQuality;
            renderer.shadowMap.enabled = quality !== 'FLAT';
            renderer.shadowMap.type = quality === 'CINEMATIC' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
            const pixelRatio = quality === 'CINEMATIC' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
            renderer.setPixelRatio(pixelRatio);
        }

        function createWorldMaterial(baseColor, options = {}) {
            const quality = state.settings.videoQuality;
            const material = new THREE.MeshStandardMaterial({
                color: baseColor,
                roughness: options.roughness ?? 0.88,
                metalness: options.metalness ?? 0.04,
                vertexColors: options.vertexColors ?? false
            });
            if (quality !== 'FLAT' && options.textureKind) {
                material.map = createSurfaceTexture(baseColor, options.textureKind, quality);
                const repeat = options.textureRepeat || [1, 1];
                material.map.repeat.set(repeat[0], repeat[1]);
            }
            return material;
        }

        function refreshCurrentWorldVisuals() {
            configureRendererForQuality();
            if (state.mode === 'TIME_ATTACK' && state.track) generateWorld(state.track.terrain, 123, state.track.gates, state.track);
            else if (state.mode === 'OPEN_WORLD' && state.track) generateWorld(state.track.terrain, 123, state.track.gates, state.track);
            else if (state.mode === 'MENU' && state.menuSceneTrack) generateWorld(state.menuSceneTrack.terrain, 123, state.menuSceneTrack.gates, state.menuSceneTrack);
            else setEnvironmentStyle(state.terrain, false);
        }

        function updateVideoQualityUI() {
            const quality = state.settings.videoQuality;
            const configs = [
                ['btn-quality-flat', 'FLAT', 'gray'],
                ['btn-quality-textured', 'TEXTURED', 'blue'],
                ['btn-quality-cinematic', 'CINEMATIC', 'cyan']
            ];
            configs.forEach(([id, value, tone]) => {
                const active = quality === value;
                const el = document.getElementById(id);
                if (!el) return;
                el.className = active
                    ? `px-3 py-2 rounded border text-xs font-bold uppercase tracking-wide ${tone === 'gray' ? 'bg-gray-600 border-gray-400 text-white' : tone === 'blue' ? 'bg-blue-700 border-blue-500 text-white' : 'bg-cyan-700 border-cyan-500 text-white'}`
                    : 'px-3 py-2 rounded bg-gray-700 border border-gray-600 text-xs font-bold uppercase tracking-wide text-gray-300';
            });
            document.getElementById('txt-video-quality').textContent = getQualityDescription(quality);
        }

        function getDefaultTextureRepeat(size, kind) {
            if (kind === 'ground') return [Math.max(1, size[0] / 14), Math.max(1, size[2] / 14)];
            if (kind === 'trim') return [Math.max(1, size[0] / 10), Math.max(1, Math.max(size[1], size[2]) / 10)];
            if (kind === 'support') return [Math.max(1, size[0] / 12), Math.max(1, Math.max(size[1], size[2]) / 12)];
            return [Math.max(1, size[0] / 16), Math.max(1, Math.max(size[1], size[2]) / 16)];
        }

        function addWorldBox(size, position, color, options = {}) {
            const textureKind = options.textureKind ?? 'panel';
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(size[0], size[1], size[2]),
                createWorldMaterial(color, {
                    roughness: options.roughness ?? 0.88,
                    metalness: options.metalness ?? 0.04,
                    textureKind,
                    textureRepeat: options.textureRepeat ?? getDefaultTextureRepeat(size, textureKind)
                })
            );
            mesh.position.set(position[0], position[1], position[2]);
            mesh.rotation.y = THREE.MathUtils.degToRad(options.rotation || 0);
            mesh.castShadow = options.castShadow ?? true;
            mesh.receiveShadow = options.receiveShadow ?? true;
            Object.assign(mesh.userData, options.userData || {});
            if (options.collider) {
                state.worldColliders.push({
                    center: new THREE.Vector3(position[0], position[1], position[2]),
                    half: new THREE.Vector3(size[0] / 2, size[1] / 2, size[2] / 2),
                    rotationY: mesh.rotation.y
                });
            }
            worldGroup.add(mesh);
            return mesh;
        }

        function resolveBoxCollision(position, collider, radius) {
            const local = position.clone().sub(collider.center).applyAxisAngle(WORLD_Y_AXIS, -collider.rotationY);
            const clamped = new THREE.Vector3(
                THREE.MathUtils.clamp(local.x, -collider.half.x, collider.half.x),
                THREE.MathUtils.clamp(local.y, -collider.half.y, collider.half.y),
                THREE.MathUtils.clamp(local.z, -collider.half.z, collider.half.z)
            );
            const delta = local.clone().sub(clamped);
            const distSq = delta.lengthSq();
            let normalLocal;
            let penetration = 0;

            if (distSq > radius * radius) return null;

            if (distSq > 0.00001) {
                const dist = Math.sqrt(distSq);
                normalLocal = delta.clone().divideScalar(dist);
                penetration = radius - dist;
            } else {
                const overlaps = [
                    { depth: collider.half.x - local.x, normal: new THREE.Vector3(1, 0, 0) },
                    { depth: collider.half.x + local.x, normal: new THREE.Vector3(-1, 0, 0) },
                    { depth: collider.half.y - local.y, normal: new THREE.Vector3(0, 1, 0) },
                    { depth: collider.half.y + local.y, normal: new THREE.Vector3(0, -1, 0) },
                    { depth: collider.half.z - local.z, normal: new THREE.Vector3(0, 0, 1) },
                    { depth: collider.half.z + local.z, normal: new THREE.Vector3(0, 0, -1) }
                ].sort((a, b) => a.depth - b.depth);
                normalLocal = overlaps[0].normal;
                penetration = overlaps[0].depth + radius;
            }

            const correction = normalLocal.clone().multiplyScalar(penetration + 0.01).applyAxisAngle(WORLD_Y_AXIS, collider.rotationY);
            const normal = normalLocal.clone().applyAxisAngle(WORLD_Y_AXIS, collider.rotationY).normalize();
            return { correction, normal };
        }

        function resolveWorldCollisions() {
            const radius = 1.2;
            for (let pass = 0; pass < 2; pass++) {
                state.worldColliders.forEach(collider => {
                    const hit = resolveBoxCollision(state.pos, collider, radius);
                    if (!hit) return;
                    state.pos.add(hit.correction);
                    const impact = state.vel.dot(hit.normal);
                    if (impact < -6) {
                        state.health = Math.max(0, state.health - Math.abs(impact) * 0.4);
                        const now3 = Date.now();
                        if (now3 - state.lastImpactSound > 350) {
                            audio.playSE(Math.abs(impact) > 14 ? 'crash' : 'impact');
                            state.lastImpactSound = now3;
                        }
                    }
                    if (impact < 0) {
                        state.vel.addScaledVector(hit.normal, -impact);
                        state.vel.multiplyScalar(0.82);
                    }
                });
            }
        }

        function addTrackProp(prop, style) {
            const pos = prop.position;
            const size = prop.size;
            const rotation = prop.rotation || 0;

            if (prop.type === 'tower') {
                addWorldBox(size, [pos[0], size[1] / 2 - 2, pos[2]], style.structure, { rotation, collider: true });
                addWorldBox([size[0] + 2, 2, size[2] + 2], [pos[0], size[1] - 2, pos[2]], style.trim, { rotation, collider: true });
                return;
            }
            if (prop.type === 'wall') {
                addWorldBox(size, [pos[0], size[1] / 2 - 2, pos[2]], style.structure, { rotation, collider: true });
                return;
            }
            if (prop.type === 'platform') {
                addWorldBox(size, [pos[0], pos[1], pos[2]], style.structure, { rotation, collider: true });
                addWorldBox([size[0] + 4, 2, size[2] + 4], [pos[0], pos[1] + size[1] / 2 + 1, pos[2]], style.trim, { rotation, collider: true });
                return;
            }
            if (prop.type === 'bridge') {
                addWorldBox([size[0], size[1], size[2]], [pos[0], pos[1], pos[2]], style.structure, { rotation, collider: true });
                addWorldBox([size[0], 2, 2], [pos[0], pos[1] + size[1] / 2 + 1, pos[2] + size[2] / 2 - 1], style.trim, { rotation, collider: true });
                addWorldBox([size[0], 2, 2], [pos[0], pos[1] + size[1] / 2 + 1, pos[2] - size[2] / 2 + 1], style.trim, { rotation, collider: true });
                return;
            }
            if (prop.type === 'tunnel') {
                addWorldBox([size[0], size[1], 2], [pos[0], pos[1], pos[2] + size[2] / 2], style.structure, { rotation, collider: true });
                addWorldBox([size[0], size[1], 2], [pos[0], pos[1], pos[2] - size[2] / 2], style.structure, { rotation, collider: true });
                addWorldBox([2, size[1], size[2]], [pos[0] + size[0] / 2, pos[1], pos[2]], style.structure, { rotation, collider: true });
                addWorldBox([2, size[1], size[2]], [pos[0] - size[0] / 2, pos[1], pos[2]], style.structure, { rotation, collider: true });
                addWorldBox([size[0], 2, size[2]], [pos[0], pos[1] + size[1] / 2, pos[2]], style.trim, { rotation, collider: true });
                return;
            }
            if (prop.type === 'arch') {
                addWorldBox([4, size[1], size[2]], [pos[0] - size[0] / 2, size[1] / 2 - 2, pos[2]], style.structure, { rotation, collider: true });
                addWorldBox([4, size[1], size[2]], [pos[0] + size[0] / 2, size[1] / 2 - 2, pos[2]], style.structure, { rotation, collider: true });
                addWorldBox([size[0] + 8, 4, size[2]], [pos[0], size[1] - 2, pos[2]], style.trim, { rotation, collider: true });
                return;
            }
            if (prop.type === 'stand') {
                addWorldBox(size, [pos[0], size[1] / 2 - 2, pos[2]], style.structure, { rotation, collider: true });
                addWorldBox([size[0] * 0.8, size[1] * 0.5, size[2] * 0.7], [pos[0], size[1] + 1, pos[2]], style.trackBed, { rotation, collider: true });
                return;
            }
            addWorldBox(size, [pos[0], size[1] / 2 - 2, pos[2]], style.structure, { rotation, collider: true });
        }

        function buildTerrainMesh(type, isTrackWorld) {
            const style = COURSE_STYLES[type] || COURSE_STYLES[CONSTANTS.TERRAINS.PLAINS];
            const geo = new THREE.PlaneGeometry(1000, 1000, isTrackWorld ? 96 : 128, isTrackWorld ? 96 : 128);
            const pos = geo.attributes.position;
            const colors = [];
            const low = new THREE.Color(style.groundLow);
            const mid = new THREE.Color(style.groundMid);
            const high = new THREE.Color(style.groundHigh);
            const bed = new THREE.Color(style.trackBed);
            const col = new THREE.Color();

            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i);
                const h = getTerrainHeight(x, y, type);
                pos.setZ(i, h);
                if (isTrackWorld) {
                    if (h < 1) col.copy(bed);
                    else if (h < 8) col.copy(low);
                    else if (h < 20) col.copy(mid);
                    else col.copy(high);
                } else {
                    if (h < 2) col.copy(new THREE.Color("#d4b483"));
                    else if (h < 15) col.copy(new THREE.Color("#15803d"));
                    else if (h < 40) col.copy(new THREE.Color("#5d4037"));
                    else col.copy(new THREE.Color("#4b5563"));
                }
                colors.push(col.r, col.g, col.b);
            }
            geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            geo.computeVertexNormals();
            const mesh = new THREE.Mesh(geo, createWorldMaterial("#ffffff", {
                vertexColors: true,
                roughness: 0.95,
                textureKind: 'ground',
                textureRepeat: isTrackWorld ? [12, 12] : [18, 18]
            }));
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = -2;
            mesh.receiveShadow = true;
            worldGroup.add(mesh);
        }

        function getTrackBounds(gates) {
            const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
            gates.forEach(g => {
                bounds.minX = Math.min(bounds.minX, g.posVec.x);
                bounds.maxX = Math.max(bounds.maxX, g.posVec.x);
                bounds.minY = Math.min(bounds.minY, g.posVec.y);
                bounds.maxY = Math.max(bounds.maxY, g.posVec.y);
                bounds.minZ = Math.min(bounds.minZ, g.posVec.z);
                bounds.maxZ = Math.max(bounds.maxZ, g.posVec.z);
            });
            bounds.centerX = (bounds.minX + bounds.maxX) / 2;
            bounds.centerZ = (bounds.minZ + bounds.maxZ) / 2;
            bounds.width = bounds.maxX - bounds.minX;
            bounds.depth = bounds.maxZ - bounds.minZ;
            return bounds;
        }

        function addTrackMarkers(track, style) {
            track.gateLayout.forEach((gate, index) => {
                if (gate.posVec.y > 16) {
                    const height = Math.max(12, gate.posVec.y - 2);
                    addWorldBox([3.5, height, 3.5], [gate.posVec.x, height / 2 - 2, gate.posVec.z], style.support, { roughness: 1, textureKind: 'support', collider: true });
                }
                if (index === 0 || index === track.gateLayout.length - 1) {
                    addWorldBox([16, 1.5, 16], [gate.posVec.x, Math.max(0.5, gate.posVec.y - 8), gate.posVec.z], style.trackBed, { roughness: 1, collider: true });
                }
            });

            for (let i = 0; i < track.gateLayout.length - 1; i++) {
                const a = track.gateLayout[i].posVec;
                const b = track.gateLayout[i + 1].posVec;
                const mid = a.clone().lerp(b, 0.5);
                const dir = b.clone().sub(a).setY(0);
                if (dir.lengthSq() < 0.001) continue;
                dir.normalize();
                const left = new THREE.Vector3(-dir.z, 0, dir.x);
                const yaw = THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z));
                [-1, 1].forEach(sign => {
                    const pos = mid.clone().add(left.clone().multiplyScalar(sign * 16));
                    addWorldBox([2.4, 6, 14], [pos.x, Math.max(2, mid.y * 0.35), pos.z], sign > 0 ? style.trim : style.structure, { rotation: yaw, collider: true });
                });
            }
        }

        function addThemeBackdrop(track, style, bounds) {
            const width = Math.max(bounds.width + 180, 520);
            const depth = Math.max(bounds.depth + 180, 520);
            addWorldBox([width, 4, depth], [bounds.centerX, -4, bounds.centerZ], style.trackBed, { roughness: 1, castShadow: false, textureKind: 'ground' });

            if (track.terrain === CONSTANTS.TERRAINS.PLAINS) {
                addWorldBox([width + 40, 24, 28], [bounds.centerX, 8, bounds.minZ - 46], style.structure, { roughness: 1, collider: true });
                addWorldBox([width + 60, 20, 28], [bounds.centerX, 6, bounds.maxZ + 46], style.structure, { roughness: 1, collider: true });
                addWorldBox([34, 30, depth + 80], [bounds.minX - 56, 10, bounds.centerZ], style.groundHigh, { roughness: 1, collider: true });
                addWorldBox([38, 26, depth + 80], [bounds.maxX + 56, 8, bounds.centerZ], style.groundHigh, { roughness: 1, collider: true });
            } else if (track.terrain === CONSTANTS.TERRAINS.MOUNTAINS) {
                addWorldBox([width + 80, 58, 30], [bounds.centerX, 25, bounds.minZ - 60], style.groundHigh, { roughness: 1, collider: true });
                addWorldBox([width + 100, 52, 30], [bounds.centerX, 22, bounds.maxZ + 60], style.groundHigh, { roughness: 1, collider: true });
                addWorldBox([30, 66, depth + 120], [bounds.minX - 72, 28, bounds.centerZ], style.groundHigh, { roughness: 1, collider: true });
                addWorldBox([30, 60, depth + 120], [bounds.maxX + 72, 24, bounds.centerZ], style.groundHigh, { roughness: 1, collider: true });
            } else if (track.terrain === CONSTANTS.TERRAINS.RUINS) {
                addWorldBox([width + 40, 18, 8], [bounds.centerX, 7, bounds.minZ - 30], style.structure, { roughness: 1, collider: true });
                addWorldBox([width + 40, 18, 8], [bounds.centerX, 7, bounds.maxZ + 30], style.structure, { roughness: 1, collider: true });
                addWorldBox([8, 24, depth + 60], [bounds.minX - 34, 10, bounds.centerZ], style.structure, { roughness: 1, collider: true });
                addWorldBox([8, 24, depth + 60], [bounds.maxX + 34, 10, bounds.centerZ], style.structure, { roughness: 1, collider: true });
                addWorldBox([42, 10, 42], [bounds.centerX, 3, bounds.centerZ], style.trackBed, { rotation: 45, roughness: 1, collider: true });
            } else if (track.terrain === CONSTANTS.TERRAINS.STADIUM) {
                addWorldBox([width + 120, 16, 20], [bounds.centerX, 5, bounds.minZ - 64], style.structure, { roughness: 0.9, collider: true });
                addWorldBox([width + 120, 16, 20], [bounds.centerX, 5, bounds.maxZ + 64], style.structure, { roughness: 0.9, collider: true });
                addWorldBox([20, 18, depth + 140], [bounds.minX - 74, 6, bounds.centerZ], style.structure, { roughness: 0.9, collider: true });
                addWorldBox([20, 18, depth + 140], [bounds.maxX + 74, 6, bounds.centerZ], style.structure, { roughness: 0.9, collider: true });
                addWorldBox([width + 60, 12, 36], [bounds.centerX, 10, bounds.minZ - 96], style.groundHigh, { roughness: 0.95, collider: true });
                addWorldBox([width + 60, 12, 36], [bounds.centerX, 10, bounds.maxZ + 96], style.groundHigh, { roughness: 0.95, collider: true });
            }
        }

        function buildRacingWorld(track) {
            const style = COURSE_STYLES[track.terrain] || COURSE_STYLES[CONSTANTS.TERRAINS.PLAINS];
            buildTerrainMesh(track.terrain, true);
            const bounds = getTrackBounds(track.gateLayout);
            addThemeBackdrop(track, style, bounds);
            addTrackMarkers(track, style);
            track.props.forEach(prop => addTrackProp(prop, style));
            state.gates = track.gateLayout.map(g => ({ posVec: g.posVec.clone(), rotEuler: g.rotEuler.clone(), id: g.id }));
            rebuildGates();
        }

        function buildOpenWorld(type, seed, gateCount) {
            buildTerrainMesh(type, false);
            state.gates = [];
            if (gateCount > 0) {
                const rnd = s => Math.sin(s)*10000 - Math.floor(Math.sin(s)*10000);
                let cx=0, cz=0, cy=5, ang=0;
                for(let i=0; i<gateCount; i++) {
                    const s = seed + i;
                    ang += (rnd(s)-0.5)*1.5;
                    const dist = 30 + rnd(s+1)*20;
                    cx += Math.sin(ang)*dist;
                    cz += Math.cos(ang)*dist;
                    const groundH = getTerrainHeight(cx, cz, type);
                    cy = Math.max(groundH + 10, Math.min(groundH + 60, cy + (rnd(s+2)-0.5)*10));
                    state.gates.push({ posVec: new THREE.Vector3(cx, cy, cz), rotEuler: new THREE.Euler(0, -ang, 0), id: i });
                }
                rebuildGates();
            }
        }

        function generateWorld(type, seed, gateCount, track = null) {
            state.terrain = type;
            clearWorldObjects();
            state.worldColliders = [];
            setEnvironmentStyle(type, Boolean(track));
            if (track) buildRacingWorld(track);
            else buildOpenWorld(type, seed, gateCount);
        }

        function rebuildGates() {
            clearWorldObjects(o => o.userData.isGate);
            state.gates.forEach((g, i) => {
                const isNext = i === state.currentGate;
                const isPassed = i < state.currentGate;
                const col = isPassed ? 0x10b981 : (isNext ? 0xf59e0b : 0x3b82f6);
                const gateMaterial = new THREE.MeshStandardMaterial({
                    color: col,
                    emissive: col,
                    emissiveIntensity: isNext ? 2.6 : 0.5,
                    transparent: isNext,
                    opacity: isNext ? 0.96 : 1,
                    depthWrite: !isNext
                });
                if (isNext) gateMaterial.depthTest = false;
                const torus = new THREE.Mesh(new THREE.TorusGeometry(3, 0.2, 16, 8), gateMaterial);
                torus.position.copy(g.posVec);
                torus.rotation.copy(g.rotEuler);
                torus.renderOrder = isNext ? 40 : 0;
                torus.userData.isGate = true;
                worldGroup.add(torus);
                if (isNext) {
                    const light = new THREE.PointLight(col, 3, 15);
                    light.position.copy(g.posVec);
                    light.userData.isGate = true;
                    worldGroup.add(light);
                    const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xfcd34d, transparent: true, opacity: 0.24, depthWrite: false });
                    beamMaterial.depthTest = false;
                    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 200, 8), beamMaterial);
                    beam.position.set(g.posVec.x, 100, g.posVec.z);
                    beam.renderOrder = 30;
                    beam.userData.isGate = true;
                    worldGroup.add(beam);
                }
            });
        }

        // --- INIT & UI LOGIC ---
        function initGame(mode, arg) {
            state.mode = mode;
            state.isPaused = false;
            state.status = 'READY';
            state.startTime = 0;
            state.finishTime = 0;
            state.autoRestartTimer = 0;
            state.currentGate = 0;
            state.lapCount = 0;
            state.health = 100;
            state.battery = getSelectedDroneStats().batteryMax;
            state.isCrashed = false;
            state.crashTimer = 0;
            state.maxSpeed = 0;
            state.crashCount = 0;
            state.lastImpactSound = 0;
            state.throttleLocked = false;
            state.throttleStick = 0;
            state.replayMode = false;
            state.replayRecord = null;
            state.replaySource = 'BEST';
            state.replayTime = 0;
            state.respawnCooldown = 0;
            state.rankLastLap = null;
            state.vel.set(0,0,0); state.angVel.set(0,0,0); state.pos.set(0, 2, 0); state.quat.identity();
            document.getElementById('popup-finish').classList.add('hidden');
            if (state.bannerHideTimer) { clearTimeout(state.bannerHideTimer); state.bannerHideTimer = null; }
            restoreMissionBanner(mode === 'TIME_ATTACK');
            if (mode === 'SELECT') {
                state.selectStage = 'TRACKS';
                state.selectDroneConfirmed = false;
                state.detailPanelOpen = false;
                state.detailPanelCollapsed = false;
                state.detailPanelKind = 'TRACK';
                state.detailTrackId = null;
                state.detailDroneClassId = null;
                state.detailDroneId = null;
            }

            let seed=123, cnt=0, type=CONSTANTS.TERRAINS.PLAINS, track=null;
            if (mode === 'TIME_ATTACK') {
                track = TRACKS.find(tr => tr.id === arg);
                state.track = track;
                state.menuSceneTrack = null;
                cnt = track.gates;
                type = track.terrain;
                const firstGate = track.gateLayout[0].posVec;
                const secondGate = track.gateLayout[1]?.posVec || firstGate.clone().add(new THREE.Vector3(0, 0, 1));
                const heading = secondGate.clone().sub(firstGate).setY(0);
                if (heading.lengthSq() < 0.001) heading.set(0, 0, 1);
                heading.normalize();
                const spawn = firstGate.clone().add(heading.clone().multiplyScalar(-track.spawnDistance));
                spawn.y = Math.max(getTerrainHeight(spawn.x, spawn.z, type) + 2, firstGate.y - 2);
                state.pos.copy(spawn);
                state.quat.setFromUnitVectors(new THREE.Vector3(0,0,-1), heading);
            } else if (mode === 'OPEN_WORLD') {
                track = TRACKS.find(tr => tr.id === arg) || TRACKS[0];
                state.track = track;
                state.menuSceneTrack = null;
                cnt = track.gates;
                type = track.terrain;
                const firstGate = track.gateLayout[0].posVec;
                const secondGate = track.gateLayout[1]?.posVec || firstGate.clone().add(new THREE.Vector3(0, 0, 1));
                const heading = secondGate.clone().sub(firstGate).setY(0);
                if (heading.lengthSq() < 0.001) heading.set(0, 0, 1);
                heading.normalize();
                const spawn = firstGate.clone().add(heading.clone().multiplyScalar(-track.spawnDistance));
                spawn.y = Math.max(getTerrainHeight(spawn.x, spawn.z, type) + 2, firstGate.y - 2);
                state.pos.copy(spawn);
                state.quat.setFromUnitVectors(new THREE.Vector3(0,0,-1), heading);
            } else {
                track = TRACKS[Math.floor(Math.random() * TRACKS.length)];
                state.track = null;
                state.menuSceneTrack = track;
                cnt = track.gates;
                type = track.terrain;
                const bounds = getTrackBounds(track.gateLayout);
                state.menuCamera = {
                    center: new THREE.Vector3(bounds.centerX, Math.max(10, bounds.minY + (bounds.maxY - bounds.minY) * 0.35), bounds.centerZ),
                    radius: Math.max(bounds.width, bounds.depth) * 0.72 + 120,
                    height: Math.max(58, bounds.maxY + 28)
                };
            }
            generateWorld(type, seed, cnt, track);
            resetLapRuntimeState();
            if (mode === 'TIME_ATTACK') refreshGhostRecord();
            else clearGhostVisuals();
            updateUI();
        }

        function resetRace() { initGame(state.mode, state.track?.id || state.terrain); }
        function restartLap() {
            state.status = 'RUNNING'; state.startTime = Date.now(); state.currentGate = 1; state.lapCount = 0;
            state.health = 100; state.battery = getSelectedDroneStats().batteryMax;
            state.isCrashed = false; state.crashTimer = 0;
            state.maxSpeed = 0; state.crashCount = 0; state.lastImpactSound = 0;
            state.autoRestartTimer = 0; state.throttleLocked = false;
            state.replayMode = false; state.replayRecord = null; state.replayTime = 0;
            resetLapRuntimeState();
            captureLapSample(true);
            document.getElementById('popup-finish').classList.add('hidden');
            rebuildGates();
        }
        function togglePause() {
            if (state.mode === 'MENU') return;
            state.isPaused = !state.isPaused;
            updateUI();
            const p = document.getElementById('popup-pause');
            state.isPaused ? p.classList.remove('hidden') : p.classList.add('hidden');
        }

        // --- TRANSLATION ---
        function updateText() {
            const T = TEXT[state.lang];
            const setTxt = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
            
            setTxt('btn-mode-timeattack', T.startRace);
            setTxt('btn-mode-freeselect', T.freeFlight);
            setTxt('btn-settings-open', T.settings);
            setTxt('btn-settings-pause', T.settings);
            
            setTxt('btn-back-menu', T.back);
            setTxt('btn-back-free', T.back);
            setTxt('txt-prep', T.prep);
            setTxt('btn-start-race', T.startRace);
            setTxt('txt-custom-tuning', T.custom);
            setTxt('txt-mission-title', T.missionStart);
            
            setTxt('txt-select-terrain', T.selectTerrain);
            setTxt('txt-mission-sub', T.missionSub);
            
            setTxt('btn-finish-reset', T.replay);
            setTxt('btn-finish-menu', T.toMenu);
            setTxt('btn-resume', T.resume);
            setTxt('btn-restart', T.restart);
            setTxt('btn-quit', T.quit);
            
            document.getElementById('btn-lang').textContent = state.lang === 'EN' ? 'EN / JP' : 'JP / EN';
        }

        // --- IMPORT/EXPORT ---
        function exportSave() {
            const data = {
                settings: state.settings,
                selectedDroneClassId: state.droneClassId,
                selectedDroneId: state.droneId,
                lang: state.lang
            };
            const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'skyracers_save.json';
            a.click();
        }
        function importSave(e) {
            const file = e.target.files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const data = JSON.parse(evt.target.result);
                    if(data.settings) {
                        state.settings = { ...state.settings, ...data.settings };
                        // Update UI inputs
                        document.getElementById('input-volume').value = state.settings.volume;
                        document.getElementById('input-rate').value = state.settings.rate;
                        document.getElementById('input-expo').value = state.settings.expo;
                        document.getElementById('input-deadzone').value = state.settings.deadzone;
                        document.getElementById('input-show').checked = state.settings.showInput;
                        const compassEl2 = document.getElementById('input-compass');
                        if (compassEl2) compassEl2.checked = state.settings.showCompass ?? true;
                        const horizonEl2 = document.getElementById('input-horizon');
                        if (horizonEl2) horizonEl2.checked = state.settings.showHorizon ?? true;
                        document.getElementById('val-volume').innerText = Math.round(state.settings.volume*100)+'%';
                        document.getElementById('val-rate').innerText = state.settings.rate;
                        document.getElementById('val-expo').innerText = state.settings.expo;
                        document.getElementById('val-deadzone').innerText = state.settings.deadzone;
                        updateVideoQualityUI();
                        refreshCurrentWorldVisuals();
                    }
                    if (data.selectedDroneClassId) state.droneClassId = getDroneClassById(data.selectedDroneClassId).id;
                    if (data.selectedDroneId) state.droneId = getDroneEntryById(data.selectedDroneId).id;
                    if(data.lang) { state.lang = data.lang; updateText(); }
                    alert("Data Loaded!");
                } catch(err) { alert("Invalid Save File"); }
            };
            reader.readAsText(file);
        }

        // --- DOM RENDERING ---
        function showScreen(id) {
            document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
            document.getElementById(id).classList.remove('hidden');
            state.menuIndex = 0; // Reset focus
        }
        function showPopup(id) { document.getElementById(id).classList.remove('hidden'); state.menuIndex = 0; }

        function updateUI() {
            const ui = document.getElementById('ui-layer'); ui.classList.remove('hidden');
            document.getElementById('canvas-container').classList.toggle('menu-preview', state.mode === 'MENU');
            updateVideoQualityUI();
            if (state.mode === 'MENU') showScreen('screen-menu');
            else if (state.mode === 'SELECT') { showScreen('screen-select'); renderSelectPrep(); }
            else if (state.mode === 'FREE_SELECT') { showScreen('screen-freeselect'); renderFreeFlightTracks(); }
            else if (['TIME_ATTACK', 'OPEN_WORLD'].includes(state.mode)) {
                showScreen('screen-hud');
                const missionEl = document.getElementById('mission-start-msg');
                const showMission = state.mode === 'TIME_ATTACK' && state.status === 'READY';
                missionEl.classList.toggle('hidden', !showMission);
                missionEl.classList.toggle('opacity-0', !showMission);
                document.getElementById('hud-timer-container').classList.toggle('hidden', state.mode !== 'TIME_ATTACK');
            }
            const mobileControlsEl = document.getElementById('mobile-controls');
            if (mobileControlsEl) {
                const showMobileControls = state.mobile.enabled && ['TIME_ATTACK', 'OPEN_WORLD'].includes(state.mode) && !state.isPaused;
                mobileControlsEl.classList.toggle('is-visible', showMobileControls);
            }
            updateHUD();
        }

        function updateHUD() {
            const hp = document.getElementById('hud-health');
            hp.textContent = Math.ceil(state.health) + '%';
            hp.className = state.health < 30 ? 'text-red-500 animate-pulse font-mono' : 'text-blue-400 font-mono';

            const bat = document.getElementById('hud-battery');
            const selectedDrone = getSelectedDroneStats();
            const displayedBatteryVoltage = getLoadedBatteryVoltage(selectedDrone, state.battery, state.lastControls.throttle, state.vel.length());
            const batteryRatio = Math.max(0, Math.min(1, (displayedBatteryVoltage - selectedDrone.batteryMin) / Math.max(0.2, selectedDrone.batteryMax - selectedDrone.batteryMin)));
            bat.textContent = `${displayedBatteryVoltage.toFixed(1)}V`;
            bat.className = batteryRatio <= 0.08 ? 'text-red-500 animate-pulse font-bold font-mono'
                : batteryRatio < 0.22 ? 'text-red-400 font-mono'
                : batteryRatio < 0.45 ? 'text-yellow-400 font-mono'
                : 'text-green-400 font-mono';

            const spd = document.getElementById('hud-speed');
            if (spd) {
                spd.textContent = state.vel.length().toFixed(1) + ' m/s';
                spd.className = state.vel.length() > 20 ? 'text-yellow-300 font-mono font-bold' : 'text-cyan-400 font-mono';
            }

            const tm = document.getElementById('hud-timer');
            if (tm) {
                if (state.replayMode && state.replayRecord) {
                    tm.textContent = `${state.replayTime.toFixed(2)}`;
                    tm.className = 'text-3xl font-mono font-bold text-emerald-300';
                } else if (state.mode === 'TIME_ATTACK' && state.status === 'RUNNING') {
                    tm.textContent = getCurrentLapTimeSeconds().toFixed(2);
                    tm.className = 'text-3xl font-mono font-bold text-white';
                } else {
                    tm.textContent = 'READY';
                    tm.className = 'text-3xl font-mono font-bold text-yellow-400';
                }
            }

            const lapsEl = document.getElementById('hud-laps');
            if (lapsEl) lapsEl.textContent = state.replayMode ? `Replay ${state.replaySource}` : `Laps ${state.lapCount}`;

            for (let i = 0; i < DEFAULT_SECTOR_COUNT; i++) {
                const sectorEl = document.getElementById(`hud-sector-${i + 1}`);
                if (!sectorEl) continue;
                const value = state.sectorTimes[i];
                sectorEl.textContent = `S${i + 1} ${Number.isFinite(value) ? value.toFixed(2) : '--'}`;
                sectorEl.className = Number.isFinite(value)
                    ? 'px-2 py-1 rounded bg-emerald-500/15 border border-emerald-400/25 text-emerald-200'
                    : state.sectorIndex === i
                        ? 'px-2 py-1 rounded bg-cyan-500/15 border border-cyan-400/25 text-cyan-200'
                        : 'px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-400';
            }

            const sectorDeltaEl = document.getElementById('hud-sector-delta');
            if (sectorDeltaEl) {
                if (state.replayMode && state.replayRecord) {
                    sectorDeltaEl.textContent = `Replay ${formatTime(state.replayRecord.duration)}`;
                    sectorDeltaEl.className = 'text-[10px] text-emerald-300 uppercase tracking-[0.2em] mt-2';
                } else if (Number.isFinite(state.sectorDelta)) {
                    sectorDeltaEl.textContent = `Sector ${formatDelta(state.sectorDelta)}`;
                    sectorDeltaEl.className = `text-[10px] uppercase tracking-[0.2em] mt-2 ${state.sectorDelta <= 0.005 ? 'text-emerald-300' : 'text-amber-300'}`;
                } else {
                    sectorDeltaEl.textContent = state.mode === 'TIME_ATTACK' ? 'Sectors armed' : 'Free flight';
                    sectorDeltaEl.className = 'text-[10px] text-gray-400 uppercase tracking-[0.2em] mt-2';
                }
            }

            const ghostStatusEl = document.getElementById('hud-ghost-status');
            if (ghostStatusEl) {
                if (state.replayMode && state.replayRecord) ghostStatusEl.textContent = `Replay source ${state.replaySource}`;
                else if (state.ghostRecord) ghostStatusEl.textContent = `Ghost ${formatTime(state.ghostRecord.duration)} / Respawn +${state.timePenaltySeconds.toFixed(1)}s`;
                else ghostStatusEl.textContent = 'Ghost standby';
            }


            const canReplay = !!(state.ghostRecord || state.lastLapRecord);
            const finishReplayBtn = document.getElementById('btn-finish-replay');
            if (finishReplayBtn) finishReplayBtn.disabled = !canReplay;
            const pauseReplayBtn = document.getElementById('btn-replay-pause');
            if (pauseReplayBtn) pauseReplayBtn.disabled = !canReplay;

            const crashOverlay = document.getElementById('crash-overlay');
            if (crashOverlay) {
                crashOverlay.classList.toggle('hidden', !state.isCrashed);
                if (state.isCrashed) {
                    const cd = document.getElementById('crash-countdown');
                    if (cd) cd.textContent = `Respawning in ${Math.ceil(state.crashTimer)}s...`;
                }
            }

            document.getElementById('input-viz-container').classList.toggle('hidden', !state.settings.showInput);
            if (state.settings.showInput) drawInputViz();

            const inFlight = ['TIME_ATTACK', 'OPEN_WORLD'].includes(state.mode) && !state.isPaused && !state.replayMode;
            const compassEl = document.getElementById('hud-compass');
            if (compassEl) {
                const show = inFlight && state.settings.showCompass;
                compassEl.classList.toggle('hidden', !show);
                if (show) drawCompass();
            }
            const horizonEl = document.getElementById('hud-horizon');
            if (horizonEl) {
                const show = inFlight && state.settings.showHorizon;
                horizonEl.classList.toggle('hidden', !show);
                if (show) drawHorizon();
            }
        }

        function drawInputViz() {
            const cvs = document.getElementById('input-canvas'); const ctx = cvs.getContext('2d');
            ctx.clearRect(0,0,cvs.width,cvs.height);
            ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.fillStyle='rgba(255,255,255,0.9)';
            const draw = (ox, oy, x, y) => { ctx.beginPath(); ctx.arc(ox, oy, 25, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(ox + x*25, oy - y*25, 4, 0, 7); ctx.fill(); };
            draw(35, 35, state.lastControls.yaw, state.lastControls.throttle*2 - 1);
            draw(105, 35, state.lastControls.roll, -state.lastControls.pitch);
        }

        // --- コンパス（方角ゲージ + 次ゲートベアリング）---
        function drawCompass() {
            const cvs = document.getElementById('compass-canvas');
            if (!cvs) return;
            const ctx = cvs.getContext('2d');
            const W = cvs.width, H = cvs.height;
            ctx.clearRect(0, 0, W, H);

            // 背景
            ctx.fillStyle = 'rgba(0,0,0,0.58)';
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(0, 0, W, H, 7) : ctx.rect(0, 0, W, H);
            ctx.fill();

            // 機体の forward ベクトルからヘディング取得
            const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(state.quat);
            const heading = ((Math.atan2(fwd.x, -fwd.z) * 180 / Math.PI) + 360) % 360;
            const degsPerPx = 90 / W; // 画面幅で90°分表示

            // カーディナル方向ラベル
            const CARD = { 0:'N', 45:'NE', 90:'E', 135:'SE', 180:'S', 225:'SW', 270:'W', 315:'NW' };

            // 目盛りとラベル描画
            for (let d = -54; d <= 54; d += 5) {
                const trueDeg = ((Math.round(heading / 5) * 5 + d) % 360 + 360) % 360;
                let od = trueDeg - heading;
                if (od > 180) od -= 360;
                if (od < -180) od += 360;
                const x = W / 2 + od / degsPerPx;
                if (x < 4 || x > W - 4) continue;

                const isCard = CARD[trueDeg] !== undefined;
                const isMajor = trueDeg % 30 === 0;
                const tickH = isCard ? 18 : isMajor ? 12 : 7;

                ctx.strokeStyle = isCard ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)';
                ctx.lineWidth = isCard ? 2 : 1;
                ctx.beginPath();
                ctx.moveTo(x, H);
                ctx.lineTo(x, H - tickH);
                ctx.stroke();

                if (isCard || (isMajor && !isCard)) {
                    const label = CARD[trueDeg] || String(trueDeg);
                    ctx.fillStyle = isCard ? '#ffffff' : 'rgba(255,255,255,0.65)';
                    ctx.font = isCard ? 'bold 11px monospace' : '9px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(label, x, H - tickH - 4);
                }
            }

            // 現在ヘディング数値（中央上）
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 13px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(Math.round(heading).toString().padStart(3, '0') + '°', W / 2, 15);

            // 中央三角マーカー（下向き、黄色）
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.moveTo(W / 2, H - 2);
            ctx.lineTo(W / 2 - 7, H - 15);
            ctx.lineTo(W / 2 + 7, H - 15);
            ctx.closePath();
            ctx.fill();

            // 次ゲートのベアリングマーカー（シアン）
            if (state.mode === 'TIME_ATTACK' && state.gates && state.currentGate < state.gates.length) {
                const gate = state.gates[state.currentGate];
                const toGate = gate.posVec.clone().sub(state.pos).setY(0);
                if (toGate.lengthSq() > 1) {
                    const gateBrg = ((Math.atan2(toGate.x, -toGate.z) * 180 / Math.PI) + 360) % 360;
                    let rel = gateBrg - heading;
                    if (rel > 180) rel -= 360;
                    if (rel < -180) rel += 360;
                    const gx = W / 2 + rel / degsPerPx;
                    if (gx >= 10 && gx <= W - 10) {
                        // テープ内: 上から下向き三角
                        ctx.fillStyle = '#22d3ee';
                        ctx.beginPath();
                        ctx.moveTo(gx, 22);
                        ctx.lineTo(gx - 6, 10);
                        ctx.lineTo(gx + 6, 10);
                        ctx.closePath();
                        ctx.fill();
                        // 距離
                        const dist = Math.round(toGate.length());
                        ctx.fillStyle = '#22d3ee';
                        ctx.font = '8px monospace';
                        ctx.textAlign = 'center';
                        ctx.fillText(dist + 'm', gx, 34);
                    } else {
                        // テープ外: 端に矢印
                        const ex = rel > 0 ? W - 18 : 18;
                        ctx.fillStyle = '#22d3ee';
                        ctx.font = 'bold 16px monospace';
                        ctx.textAlign = 'center';
                        ctx.fillText(rel > 0 ? '▶' : '◀', ex, H / 2 + 6);
                    }
                }
            }

            // 外枠
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(0, 0, W, H, 7) : ctx.rect(0, 0, W, H);
            ctx.stroke();
        }

        // --- 水平儀（アーティフィシャルホライゾン）---
        function drawHorizon() {
            const cvs = document.getElementById('horizon-canvas');
            if (!cvs) return;
            const ctx = cvs.getContext('2d');
            const W = cvs.width, H = cvs.height;
            const cx = W / 2, cy = H / 2, R = cx - 2;

            ctx.clearRect(0, 0, W, H);

            // クォータニオンからピッチ・ロール抽出
            const euler = new THREE.Euler().setFromQuaternion(state.quat, 'YXZ');
            const pitchDeg =  THREE.MathUtils.radToDeg(euler.x);   // + = 機首下
            const rollDeg  = -THREE.MathUtils.radToDeg(euler.z);   // + = 右バンク
            const rollRad  =  THREE.MathUtils.degToRad(rollDeg);
            const pxPerDeg = 2.4;
            const pitchOffset = pitchDeg * pxPerDeg;

            // 円形クリップ
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.clip();

            // バンク回転で空/地面を描画
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rollRad);

            // 空（濃紺）
            ctx.fillStyle = '#1a3a5c';
            ctx.fillRect(-W * 2, -H * 2 - pitchOffset, W * 4, H * 2);
            // 地面（濃茶）
            ctx.fillStyle = '#4a2e12';
            ctx.fillRect(-W * 2, -pitchOffset, W * 4, H * 2);

            // 地平線
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-W, -pitchOffset);
            ctx.lineTo(W, -pitchOffset);
            ctx.stroke();

            // ピッチラダー（10°ごと）
            ctx.font = '8px monospace';
            for (let p = -40; p <= 40; p += 10) {
                if (p === 0) continue;
                const py = -pitchOffset - p * pxPerDeg;
                if (Math.abs(py) > R * 1.3) continue;
                const len = Math.abs(p) % 20 === 0 ? R * 0.48 : R * 0.28;
                ctx.strokeStyle = 'rgba(255,255,255,0.65)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(-len, py);
                ctx.lineTo(len, py);
                ctx.stroke();
                ctx.fillStyle = 'rgba(255,255,255,0.75)';
                ctx.textAlign = 'right';
                ctx.fillText(Math.abs(p), -len - 3, py + 4);
                ctx.textAlign = 'left';
                ctx.fillText(Math.abs(p), len + 3, py + 4);
            }
            ctx.restore();

            // 機体基準マーク（固定・黄色）
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(cx - 46, cy); ctx.lineTo(cx - 16, cy); ctx.lineTo(cx - 16, cy + 7); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + 46, cy); ctx.lineTo(cx + 16, cy); ctx.lineTo(cx + 16, cy + 7); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fillStyle = '#fbbf24'; ctx.fill();

            ctx.restore(); // clip 解除

            // バンク角弧と目盛り
            ctx.save();
            ctx.translate(cx, cy);
            ctx.strokeStyle = 'rgba(255,255,255,0.32)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, R - 5, THREE.MathUtils.degToRad(-75 - 90), THREE.MathUtils.degToRad(75 - 90));
            ctx.stroke();

            [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60].forEach(deg => {
                const rad = THREE.MathUtils.degToRad(deg - 90);
                const len = Math.abs(deg) % 30 === 0 ? 10 : 6;
                ctx.strokeStyle = 'rgba(255,255,255,0.55)';
                ctx.lineWidth = Math.abs(deg) % 30 === 0 ? 1.5 : 1;
                ctx.beginPath();
                ctx.moveTo(Math.cos(rad) * (R - 5 - len), Math.sin(rad) * (R - 5 - len));
                ctx.lineTo(Math.cos(rad) * (R - 5), Math.sin(rad) * (R - 5));
                ctx.stroke();
            });

            // バンク角ポインタ（三角、ロールに追従）
            const ptrAngle = THREE.MathUtils.degToRad(-rollDeg - 90);
            ctx.save();
            ctx.translate(Math.cos(ptrAngle) * (R - 7), Math.sin(ptrAngle) * (R - 7));
            ctx.rotate(ptrAngle + Math.PI / 2);
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.moveTo(0, -8); ctx.lineTo(-5, 0); ctx.lineTo(5, 0);
            ctx.closePath(); ctx.fill();
            ctx.restore();

            ctx.restore();

            // 外枠
            ctx.strokeStyle = 'rgba(255,255,255,0.28)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.stroke();
        }

        function getSelectedDroneClass() {
            const droneClass = getDroneClassById(state.droneClassId);
            if (state.droneClassId !== droneClass.id) state.droneClassId = droneClass.id;
            return droneClass;
        }

        function getSelectedDroneStats() {
            const drone = getDroneEntryById(state.droneId);
            if (state.droneId !== drone.id) state.droneId = drone.id;
            if (state.droneClassId !== drone.classId) state.droneClassId = drone.classId;
            return drone;
        }

        function setDetailStat(slot, label, value, accent = false) {
            const labelEl = document.getElementById(`detail-stat-${slot}-label`);
            const valueEl = document.getElementById(`detail-stat-${slot}-value`);
            if (labelEl) labelEl.textContent = label;
            if (valueEl) {
                valueEl.textContent = value;
                valueEl.className = accent
                    ? 'text-sm font-semibold text-cyan-300 mt-2'
                    : 'text-sm font-semibold text-white mt-2';
            }
        }

        function setDetailPanelVisibility(open, animate = false) {
            const emptyEl = document.getElementById('detail-panel-empty');
            const cardEl = document.getElementById('detail-panel-card');
            if (!emptyEl || !cardEl) return;
            if (!open) {
                emptyEl.classList.remove('opacity-0', 'translate-y-2', 'pointer-events-none');
                cardEl.classList.add('opacity-0', 'translate-y-4', 'scale-[0.985]', 'pointer-events-none');
                return;
            }
            emptyEl.classList.add('opacity-0', 'translate-y-2', 'pointer-events-none');
            const reveal = () => {
                cardEl.classList.remove('opacity-0', 'translate-y-4', 'scale-[0.985]', 'pointer-events-none');
            };
            if (animate) {
                cardEl.classList.add('opacity-0', 'translate-y-4', 'scale-[0.985]', 'pointer-events-none');
                requestAnimationFrame(reveal);
            } else {
                reveal();
            }
        }

        function setDetailPanelCollapsed(collapsed) {
            state.detailPanelCollapsed = !!collapsed;
            const bodyEl = document.getElementById('detail-panel-body');
            const toggleEl = document.getElementById('detail-panel-toggle');
            if (bodyEl) bodyEl.classList.toggle('hidden', state.detailPanelCollapsed);
            if (toggleEl) toggleEl.textContent = state.detailPanelCollapsed ? 'Expand' : 'Collapse';
        }

        function showDetailPanel(kind, payload = {}) {
            state.detailPanelKind = kind;
            if (payload.trackId) state.detailTrackId = payload.trackId;
            if (kind === 'TRACK') {
                state.detailTrackId = payload.trackId ?? state.track?.id ?? null;
            } else if (kind === 'CLASS') {
                state.detailDroneClassId = payload.droneClassId ?? state.droneClassId;
                state.detailDroneId = null;
            } else if (kind === 'DRONE') {
                const drone = getDroneEntryById(payload.droneId ?? state.droneId);
                state.detailDroneId = drone.id;
                state.detailDroneClassId = drone.classId;
            }
            state.detailPanelOpen = true;
            updateDetailPanel();
            setDetailPanelVisibility(true, true);
        }

        function closeDetailPanel() {
            state.detailPanelOpen = false;
            updateDetailPanel();
        }

        function updateDetailPanel() {
            const emptyTitleEl = document.getElementById('detail-panel-empty-title');
            const emptyCopyEl = document.getElementById('detail-panel-empty-copy');
            const kickerEl = document.getElementById('detail-panel-kicker');
            const titleEl = document.getElementById('detail-panel-title');
            const subtitleEl = document.getElementById('detail-panel-subtitle');
            const badgeEl = document.getElementById('detail-panel-badge');
            const summaryEl = document.getElementById('detail-summary');
            const metaEl = document.getElementById('detail-meta');
            const rankingEl = document.getElementById('detail-ranking');
            const rankingBodyEl = document.getElementById('detail-ranking-body');
            const previewWrapEl = document.getElementById('detail-preview-wrap');
            const selectedClass = getSelectedDroneClass();
            const selectedDrone = getSelectedDroneStats();
            const track = state.detailTrackId ? (TRACKS.find(item => item.id === state.detailTrackId) || state.track) : state.track;
            const detailClass = state.detailDroneClassId ? getDroneClassById(state.detailDroneClassId) : selectedClass;
            const detailDrone = state.detailDroneId ? getDroneEntryById(state.detailDroneId) : selectedDrone;

            if (!state.detailPanelOpen) {
                if (emptyTitleEl) emptyTitleEl.textContent = state.selectStage === 'TRACKS'
                    ? 'Press Detail on a Course'
                    : state.selectStage === 'CLASSES'
                        ? 'Press Detail on a Drone Class'
                        : 'Press Detail on a Drone';
                if (emptyCopyEl) emptyCopyEl.textContent = state.selectStage === 'TRACKS'
                    ? 'Course route, terrain, and class-specific best times appear here.'
                    : state.selectStage === 'CLASSES'
                        ? 'Class notes, voltage band, and current course records appear here.'
                        : 'Exact aircraft specs and current class records appear here.';
                if (previewWrapEl) previewWrapEl.classList.add('hidden');
                if (rankingEl) rankingEl.classList.add('hidden');
                if (rankingBodyEl) rankingBodyEl.innerHTML = '';
                renderTrackAerialPreview(null);
                setDetailPanelCollapsed(state.detailPanelCollapsed);
                setDetailPanelVisibility(false);
                return;
            }

            if (state.detailPanelKind === 'TRACK' && track) {
                const best = getBestTime(track.id, selectedClass.id);
                const bounds = getTrackBounds(track.gateLayout);
                if (kickerEl) kickerEl.textContent = 'Course Detail';
                if (titleEl) titleEl.textContent = track.name;
                if (subtitleEl) subtitleEl.textContent = track.tagline;
                if (badgeEl) badgeEl.textContent = track.terrain;
                setDetailStat(1, 'Profile', track.profile);
                setDetailStat(2, 'Difficulty', track.difficulty);
                setDetailStat(3, 'Length', `${track.lengthMeters}m`);
                setDetailStat(4, 'Class Best', formatTime(best), true);
                if (summaryEl) summaryEl.textContent = track.compact ? `Current class: ${selectedClass.displayName}. This is a compact layout tuned for Tiny and Whoop pace, with class-separated records.` : `Current class: ${selectedClass.displayName}. Time Attack records are stored separately for each drone class on the same course.`;
                if (metaEl) metaEl.textContent = `${track.compact ? 'Compact / ' : ''}${track.gates} gates / Span ${Math.round(Math.max(bounds.width, bounds.depth))}m / Alt ${Math.round(bounds.maxY - bounds.minY)}m / Spawn ${track.spawnDistance}m`;
                if (rankingEl) rankingEl.classList.remove('hidden');
                if (rankingBodyEl) rankingBodyEl.innerHTML = renderLeaderboardPanel(track.id, selectedClass.id);
                if (previewWrapEl) previewWrapEl.classList.remove('hidden');
                renderTrackAerialPreview(track);
            } else if (state.detailPanelKind === 'CLASS' && detailClass) {
                const rep = detailClass.entries[0];
                const classBest = track ? getBestTime(track.id, detailClass.id) : null;
                if (kickerEl) kickerEl.textContent = 'Drone Class Detail';
                if (titleEl) titleEl.textContent = detailClass.displayName;
                if (subtitleEl) subtitleEl.textContent = detailClass.designRole;
                if (badgeEl) badgeEl.textContent = detailClass.batteryBand;
                setDetailStat(1, 'Entries', `${detailClass.entries.length}`);
                setDetailStat(2, 'Rep Voltage', `${rep.batteryNominal.toFixed(1)}V`);
                setDetailStat(3, 'Rep Mass', formatMassKg(rep.massKg));
                setDetailStat(4, 'Course Best', formatTime(classBest), true);
                if (summaryEl) summaryEl.textContent = `${rep.name} is the representative setup. Speed ${rep.speed}, agility ${rep.agility}, weight ${rep.weight}, flight ${formatMinutes(rep.flightTimeMin)}.`;
                if (metaEl) metaEl.textContent = track
                    ? `${track.name} keeps a separate record for ${detailClass.displayName}.`
                    : 'Choose a course to compare this class against a Time Attack record.';
                if (rankingEl) rankingEl.classList.toggle('hidden', !track);
                if (rankingBodyEl) rankingBodyEl.innerHTML = track ? renderLeaderboardPanel(track.id, detailClass.id) : '';
                if (previewWrapEl) previewWrapEl.classList.add('hidden');
                renderTrackAerialPreview(null);
            } else if (detailDrone) {
                const droneBest = track ? getBestTime(track.id, detailDrone.classId) : null;
                const droneClass = getDroneClassById(detailDrone.classId);
                if (kickerEl) kickerEl.textContent = 'Drone Detail';
                if (titleEl) titleEl.textContent = detailDrone.name;
                if (subtitleEl) subtitleEl.textContent = detailDrone.typeNote;
                if (badgeEl) badgeEl.textContent = `${detailDrone.sizeMm}mm`;
                setDetailStat(1, 'Speed', `${detailDrone.speed}`);
                setDetailStat(2, 'Agility', `${detailDrone.agility}`);
                setDetailStat(3, 'Weight', `${detailDrone.weight}`);
                setDetailStat(4, 'Battery', `${detailDrone.batteryNominal.toFixed(1)}V`, true);
                if (summaryEl) summaryEl.textContent = `${detailDrone.topSpeedKmh ? `Top ${detailDrone.topSpeedKmh} km/h / ` : ""}Mass ${formatMassKg(detailDrone.massKg)} / Flight ${formatMinutes(detailDrone.flightTimeMin)} / Class ${droneClass.displayName}.`;
                if (metaEl) metaEl.textContent = track
                    ? `${track.name} / ${droneClass.displayName} best: ${formatTime(droneBest)}`
                    : 'Choose a course to compare this drone class against a Time Attack record.';
                if (rankingEl) rankingEl.classList.toggle('hidden', !track);
                if (rankingBodyEl) rankingBodyEl.innerHTML = track ? renderLeaderboardPanel(track.id, detailDrone.classId) : '';
                if (previewWrapEl) previewWrapEl.classList.add('hidden');
                renderTrackAerialPreview(null);
            }

            setDetailPanelCollapsed(state.detailPanelCollapsed);
            setDetailPanelVisibility(true);
        }

        function updateSelectBriefing() {
            const track = state.track;
            const droneClass = getSelectedDroneClass();
            const droneStats = getSelectedDroneStats();
            const stepEl = document.getElementById('txt-select-step');
            const helperEl = document.getElementById('txt-select-helper');
            const hintEl = document.getElementById('txt-start-hint');
            const startBtn = document.getElementById('btn-start-race');
            const stageLabels = {
                TRACKS: ['Pick a Course', 'Select a course, or use Detail to inspect the route first.'],
                CLASSES: ['Choose Drone Class', 'Pick a class. Detail shows its course-specific record and representative setup.'],
                DRONES: ['Choose Drone', 'Pick the exact drone. Detail opens the full spec sheet.']
            };
            const [stepTitle, helperText] = stageLabels[state.selectStage] || stageLabels.TRACKS;

            if (stepEl) stepEl.textContent = stepTitle;
            if (helperEl) helperEl.textContent = helperText;
            if (startBtn) startBtn.disabled = !(track && state.selectDroneConfirmed);
            if (hintEl) {
                hintEl.textContent = !track
                    ? 'Pick a course to begin.'
                    : state.selectStage === 'CLASSES'
                        ? `${track.name} selected. Choose a drone class, or inspect one with Detail.`
                        : state.selectDroneConfirmed
                            ? `${track.name} / ${droneStats.name}. Ready to launch.`
                            : `${track.name} / ${droneClass.displayName}. Choose your drone or open Detail for full specs.`;
            }

            updateDetailPanel();
        }

        function renderTrackAerialPreview(track) {
            const canvas = document.getElementById('track-aerial-preview');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const width = canvas.width;
            const height = canvas.height;
            const gradient = ctx.createLinearGradient(0, 0, width, height);
            gradient.addColorStop(0, '#020617');
            gradient.addColorStop(1, '#0f172a');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);

            ctx.strokeStyle = 'rgba(148,163,184,0.12)';
            ctx.lineWidth = 1;
            for (let x = 24; x < width; x += 24) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
            for (let y = 24; y < height; y += 24) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }

            if (!track) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '600 28px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Select a course', width / 2, height / 2 - 8);
                ctx.fillStyle = 'rgba(148,163,184,0.7)';
                ctx.font = '18px sans-serif';
                ctx.fillText('The overhead race line appears here.', width / 2, height / 2 + 26);
                return;
            }

            const bounds = getTrackBounds(track.gateLayout);
            const margin = 42;
            const spanX = Math.max(bounds.width, 1);
            const spanZ = Math.max(bounds.depth, 1);
            const scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanZ);
            const project = gate => ({
                x: width / 2 + (gate.posVec.x - bounds.centerX) * scale,
                y: height / 2 + (gate.posVec.z - bounds.centerZ) * scale
            });

            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 18;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            track.gateLayout.forEach((gate, index) => {
                const point = project(gate);
                if (index === 0) ctx.moveTo(point.x, point.y);
                else ctx.lineTo(point.x, point.y);
            });
            ctx.stroke();

            ctx.strokeStyle = 'rgba(34,211,238,0.95)';
            ctx.lineWidth = 10;
            ctx.beginPath();
            track.gateLayout.forEach((gate, index) => {
                const point = project(gate);
                if (index === 0) ctx.moveTo(point.x, point.y);
                else ctx.lineTo(point.x, point.y);
            });
            ctx.stroke();

            track.gateLayout.forEach((gate, index) => {
                const point = project(gate);
                const isFirst = index === 0;
                const isLast = index === track.gateLayout.length - 1;
                ctx.fillStyle = isFirst ? '#22c55e' : (isLast ? '#f97316' : '#e2e8f0');
                ctx.beginPath();
                ctx.arc(point.x, point.y, isFirst || isLast ? 9 : 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 13px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(String(index + 1), point.x, point.y + 4);
            });

            ctx.fillStyle = 'rgba(148,163,184,0.85)';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`Launch: Gate 1`, 18, 28);
            ctx.textAlign = 'right';
            ctx.fillText(`Finish: Gate ${track.gateLayout.length}`, width - 18, 28);
        }

        function renderTracks() {
            const grid = document.getElementById('selection-grid');
            grid.innerHTML = '';
            document.getElementById('custom-drone-panel').classList.add('hidden');

            TRACKS.forEach(t => {
                const best = getBestTime(t.id, state.droneClassId);
                const selected = state.track?.id === t.id;
                const el = document.createElement('article');
                el.className = `w-full p-4 rounded-2xl border transition-colors ${selected ? 'border-cyan-400 bg-cyan-950/30 shadow-lg shadow-cyan-900/20' : 'border-gray-700 bg-gray-800 hover:bg-gray-700'}`;
                el.innerHTML = `<div class="flex justify-between items-start gap-3"><div><h3 class="font-bold text-lg">${t.name}</h3><div class="text-xs text-gray-400 mt-1">${t.profile}</div></div><div class="flex flex-col items-end gap-2"><span class="text-xs bg-gray-700 px-2 py-1 rounded-full">${t.terrain}</span>${t.compact ? '<span class="text-[10px] uppercase tracking-[0.25em] bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-full border border-emerald-400/30">Compact</span>' : ''}</div></div><div class="text-xs text-gray-300 mt-3">${t.difficulty} / Gates: ${t.gates} / Length: ${t.lengthMeters}m</div><div class="text-xs text-cyan-300 mt-1">Class Best: ${formatTime(best)}</div><div class="text-xs text-gray-500 mt-2">${t.tagline}</div><div class="mt-4 flex gap-2"><button data-action="select" class="flex-1 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold uppercase tracking-[0.2em]">${selected ? 'Select Again' : 'Select Course'}</button><button data-action="detail" class="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-950 border border-gray-700 text-gray-200 text-xs font-bold uppercase tracking-[0.2em]">Detail</button></div>`;
                el.querySelector('[data-action="select"]').onclick = () => {
                    state.track = t;
                    state.selectStage = 'CLASSES';
                    state.selectDroneConfirmed = false;
                    renderSelectPrep();
                };
                el.querySelector('[data-action="detail"]').onclick = () => showDetailPanel('TRACK', { trackId: t.id });
                grid.appendChild(el);
            });

            updateSelectBriefing();
        }

        function renderDroneClasses() {
            const grid = document.getElementById('selection-grid');
            grid.innerHTML = '';
            document.getElementById('custom-drone-panel').classList.add('hidden');

            DRONE_CLASSES.forEach(droneClass => {
                const representative = droneClass.entries[0];
                const selected = state.droneClassId === droneClass.id;
                const classBest = state.track ? getBestTime(state.track.id, droneClass.id) : null;
                const el = document.createElement('article');
                el.className = `w-full p-4 rounded-2xl border transition-colors ${selected ? 'border-violet-400 bg-violet-950/30 shadow-lg shadow-violet-900/20' : 'border-gray-700 bg-gray-800 hover:bg-gray-700'}`;
                el.innerHTML = `<div class="flex items-start justify-between gap-3"><div><h3 class="font-bold text-lg">${droneClass.displayName}</h3><div class="text-xs text-gray-400 mt-1">${droneClass.designRole}</div></div><span class="text-xs rounded-full px-2 py-1 bg-gray-700 text-gray-200">${droneClass.entries.length} ${droneClass.entries.length === 1 ? 'entry' : 'entries'}</span></div><div class="grid grid-cols-3 gap-2 mt-3 text-xs text-gray-300"><div>Voltage ${representative.batteryNominal.toFixed(1)}V</div><div>Mass ${formatMassKg(representative.massKg)}</div><div>Flight ${formatMinutes(representative.flightTimeMin)}</div></div><div class="text-xs text-cyan-300 mt-2">Course Best: ${formatTime(classBest)}</div><div class="text-xs text-gray-500 mt-1">${droneClass.batteryBand}</div><div class="mt-4 flex gap-2"><button data-action="select" class="flex-1 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold uppercase tracking-[0.2em]">${selected ? 'Use Class' : 'Select Class'}</button><button data-action="detail" class="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-950 border border-gray-700 text-gray-200 text-xs font-bold uppercase tracking-[0.2em]">Detail</button></div>`;
                el.querySelector('[data-action="select"]').onclick = () => {
                    state.droneClassId = droneClass.id;
                    state.droneId = representative.id;
                    state.selectStage = 'DRONES';
                    state.selectDroneConfirmed = false;
                    renderSelectPrep();
                };
                el.querySelector('[data-action="detail"]').onclick = () => showDetailPanel('CLASS', { droneClassId: droneClass.id, trackId: state.track?.id });
                grid.appendChild(el);
            });

            updateSelectBriefing();
        }

        function renderDrones() {
            const grid = document.getElementById('selection-grid');
            const droneClass = getSelectedDroneClass();
            grid.innerHTML = '';
            document.getElementById('custom-drone-panel').classList.add('hidden');

            droneClass.entries.forEach(drone => {
                const selected = state.droneId === drone.id;
                const droneBest = state.track ? getBestTime(state.track.id, drone.classId) : null;
                const el = document.createElement('article');
                el.className = `w-full p-4 rounded-2xl border transition-colors ${selected ? 'border-blue-400 bg-blue-950/30 shadow-lg shadow-blue-900/20' : 'border-gray-700 bg-gray-800 hover:bg-gray-700'}`;
                el.innerHTML = `<div class="flex items-start justify-between gap-3"><div><h3 class="font-bold text-lg" style="color:#${drone.color.toString(16).padStart(6, '0')}">${drone.name}</h3><div class="text-xs text-gray-400 mt-1">${drone.typeNote}</div></div><span class="text-xs rounded-full px-2 py-1 bg-gray-700 text-gray-200">${drone.sizeMm}mm</span></div><div class="grid grid-cols-3 gap-2 mt-3 text-xs text-gray-300"><div>Speed ${drone.speed}</div><div>Agility ${drone.agility}</div><div>Weight ${drone.weight}</div></div><div class="grid grid-cols-3 gap-2 mt-2 text-xs text-gray-400"><div>Mass ${formatMassKg(drone.massKg)}</div><div>Battery ${drone.batteryNominal.toFixed(1)}V</div><div>Flight ${formatMinutes(drone.flightTimeMin)}</div></div><div class="text-xs text-cyan-300 mt-2">Class Best: ${formatTime(droneBest)}</div><div class="mt-4 flex gap-2"><button data-action="select" class="flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-[0.2em]">${selected ? 'Select Again' : 'Select Drone'}</button><button data-action="detail" class="px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-950 border border-gray-700 text-gray-200 text-xs font-bold uppercase tracking-[0.2em]">Detail</button></div>`;
                el.querySelector('[data-action="select"]').onclick = () => {
                    state.droneClassId = drone.classId;
                    state.droneId = drone.id;
                    state.selectStage = 'DRONES';
                    state.selectDroneConfirmed = true;
                    renderSelectPrep();
                };
                el.querySelector('[data-action="detail"]').onclick = () => showDetailPanel('DRONE', { droneId: drone.id, trackId: state.track?.id });
                grid.appendChild(el);
            });

            updateSelectBriefing();
        }

        function renderSelectPrep() {
            if (!state.track) state.selectStage = 'TRACKS';
            if (state.selectStage === 'TRACKS') renderTracks();
            else if (state.selectStage === 'CLASSES') renderDroneClasses();
            else renderDrones();
        }

        function renderFreeFlightTracks() {
            const grid = document.getElementById('terrain-grid'); grid.innerHTML = '';
            TRACKS.forEach(t => {
                const best = getBestTime(t.id, state.droneClassId);
                const btn = document.createElement('button');
                btn.className = `w-full text-left p-4 rounded border transition-colors ${state.track?.id===t.id ? 'border-cyan-400 bg-cyan-950/30' : 'border-gray-700 bg-gray-800 hover:bg-gray-700'}`;
                btn.innerHTML = `<div class="flex justify-between"><h3 class="font-bold">${t.name}</h3><div class="flex items-center gap-2"><span class="text-xs bg-gray-700 px-2 rounded">${t.terrain}</span>${t.compact ? '<span class="text-[10px] uppercase tracking-[0.25em] bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-full border border-emerald-400/30">Compact</span>' : ''}</div></div><div class="text-xs text-gray-400 mt-2">${t.profile} / ${t.difficulty} / Gates: ${t.gates} / Length: ${t.lengthMeters}m</div><div class="text-xs text-cyan-300 mt-1">${t.compact ? 'Compact Best' : 'Time Attack Best'}: ${formatTime(best)}</div><div class="text-xs text-gray-500 mt-1">${t.tagline}</div>`;
                btn.onclick = () => initGame('OPEN_WORLD', t.id);
                grid.appendChild(btn);
            });
        }

        // --- BINDING ---
        const bind = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };
        bind('btn-mode-timeattack', () => initGame('SELECT'));
        bind('btn-mode-freeselect', () => { state.mode='FREE_SELECT'; updateUI(); });
        bind('btn-back-menu', () => {
            if (state.mode === 'SELECT' && state.selectStage === 'DRONES') {
                state.selectStage = 'CLASSES';
                state.selectDroneConfirmed = false;
                updateUI();
                return;
            }
            if (state.mode === 'SELECT' && state.selectStage === 'CLASSES') {
                state.selectStage = 'TRACKS';
                state.track = null;
                state.selectDroneConfirmed = false;
                updateUI();
                return;
            }
            initGame('MENU');
        });
        bind('btn-back-free', () => initGame('MENU'));
        bind('btn-start-race', () => state.track && state.selectDroneConfirmed && initGame('TIME_ATTACK', state.track.id));
        bind('detail-panel-close', closeDetailPanel);
        bind('detail-panel-toggle', () => setDetailPanelCollapsed(!state.detailPanelCollapsed));
        bind('btn-pause', togglePause);
        bind('btn-resume', togglePause);
        bind('btn-replay-pause', () => { document.getElementById('popup-pause').classList.add('hidden'); startReplay(state.ghostRecord || state.lastLapRecord, state.ghostRecord ? 'BEST' : 'LAST'); });
        bind('btn-restart', () => { togglePause(); resetRace(); });
        bind('btn-quit', () => { togglePause(); initGame('MENU'); });
        bind('btn-finish-replay', () => startReplay(state.ghostRecord || state.lastLapRecord, state.ghostRecord ? 'BEST' : 'LAST'));
        bind('btn-finish-reset', resetRace);
        bind('btn-finish-menu', () => { document.getElementById('popup-finish').classList.add('hidden'); initGame('SELECT'); });
        
        // Lang
        bind('btn-lang', () => { state.lang = state.lang==='EN'?'JP':'EN'; updateText(); });
        

        // Settings
        const setPopup = document.getElementById('popup-settings');
        bind('btn-settings-open', () => setPopup.classList.remove('hidden'));
        bind('btn-settings-pause', () => { document.getElementById('popup-pause').classList.add('hidden'); setPopup.classList.remove('hidden'); });
        bind('btn-close-settings', () => { 
            setPopup.classList.add('hidden'); 
            if(state.isPaused && state.mode!=='MENU') document.getElementById('popup-pause').classList.remove('hidden'); 
        });
        bind('btn-export', exportSave);
        bind('btn-import', () => document.getElementById('file-import').click());
        document.getElementById('file-import').onchange = importSave;

        // Settings Inputs
        document.getElementById('input-volume').oninput = e => { state.settings.volume = parseFloat(e.target.value); document.getElementById('val-volume').innerText = Math.round(state.settings.volume*100)+'%'; };
        const setVideoQuality = quality => {
            state.settings.videoQuality = quality;
            updateVideoQualityUI();
            refreshCurrentWorldVisuals();
        };
        bind('btn-quality-flat', () => setVideoQuality('FLAT'));
        bind('btn-quality-textured', () => setVideoQuality('TEXTURED'));
        bind('btn-quality-cinematic', () => setVideoQuality('CINEMATIC'));
        document.getElementById('input-rate').oninput = e => { state.settings.rate = parseFloat(e.target.value); document.getElementById('val-rate').innerText = state.settings.rate; };
        document.getElementById('input-expo').oninput = e => { state.settings.expo = parseFloat(e.target.value); document.getElementById('val-expo').innerText = state.settings.expo; };
        document.getElementById('input-deadzone').oninput = e => { state.settings.deadzone = parseFloat(e.target.value); document.getElementById('val-deadzone').innerText = state.settings.deadzone; };
        document.getElementById('input-show').onchange = e => { state.settings.showInput = e.target.checked; updateUI(); };
        document.getElementById('input-compass').onchange = e => { state.settings.showCompass = e.target.checked; updateUI(); };
        document.getElementById('input-horizon').onchange = e => { state.settings.showHorizon = e.target.checked; updateUI(); };

        // Custom Drone Inputs
        const updateCustom = () => {
             state.customStats.speed = parseFloat(document.getElementById('input-cust-speed').value);
             state.customStats.agility = parseFloat(document.getElementById('input-cust-agility').value);
             state.customStats.weight = parseFloat(document.getElementById('input-cust-weight').value);
             document.getElementById('val-cust-speed').innerText = state.customStats.speed;
             document.getElementById('val-cust-agility').innerText = state.customStats.agility;
             document.getElementById('val-cust-weight').innerText = state.customStats.weight;
             if (state.mode === 'SELECT') updateSelectBriefing();
        };
        document.getElementById('input-cust-speed').oninput = updateCustom;
        document.getElementById('input-cust-agility').oninput = updateCustom;
        document.getElementById('input-cust-weight').oninput = updateCustom;

        // --- LOOP ---
        const clock = new THREE.Clock();
        function animate() {
            requestAnimationFrame(animate);
            updateMenuNavigation();
            const dt = Math.min(clock.getDelta(), 0.1);
            if (state.mode === 'MENU') {
                const t = Date.now() * 0.00012;
                const center = state.menuCamera.center;
                const radius = state.menuCamera.radius;
                camera.position.set(
                    center.x + Math.sin(t) * radius,
                    state.menuCamera.height + Math.sin(t * 0.8) * 12,
                    center.z + Math.cos(t) * radius
                );
                camera.lookAt(center.x, center.y + Math.sin(t * 0.5) * 5, center.z);
            } else if (!state.isPaused) {
                if (state.replayMode) updateReplay(dt);
                else updatePhysics(dt);

                const spd = state.vel.length();
                const targetFov = state.replayMode ? 82 : 90 + Math.min(spd * 0.45, 22);
                camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 5 * dt);
                camera.updateProjectionMatrix();

                if (!state.replayMode) {
                    camera.position.copy(state.pos);
                    camera.quaternion.copy(state.quat);
                    camera.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 6));

                    if (spd > 6 && !state.isCrashed) {
                        const t = Date.now() * 0.001;
                        const vib = Math.min(0.055, spd * 0.0016);
                        camera.position.x += Math.sin(t * 23.7) * vib;
                        camera.position.y += Math.cos(t * 17.9) * vib;
                    }
                }
            }
            updateGhostVisuals();
            renderer.render(scene, camera);
            updateHUD();
        }

        configureRendererForQuality();
        updateVideoQualityUI();
        setupMobileControls();
        document.getElementById('loading-screen').style.opacity = 0;
        setTimeout(() => document.getElementById('loading-screen').remove(), 500);
        initGame('MENU');
        animate();
        window.addEventListener('resize', () => { camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); configureRendererForQuality(); });
