window.DRONE_CLASS_DATA = {
  "metadata": {
    "generated_at": "2026-03-27",
    "purpose": "Representative drone dataset grouped by gameplay-friendly classes for game design. Brand and product names removed.",
    "classification_note": "Class labels are editorial groupings for design use, not official industry standards.",
    "unit_conventions": {
      "mass": "g or kg as named in field",
      "length": "mm",
      "voltage": "V",
      "energy": "Wh",
      "time": "min"
    },
    "interpretation_notes": [
      "Large drones often use multiple battery packs. Voltage here is stored per battery pack unless a whole-aircraft system voltage is explicitly documented.",
      "For multi-pack systems, do not multiply pack voltage by pack count unless the packs are explicitly series-connected. Many aircraft use parallel or redundant pack architectures.",
      "Weights published by manufacturers differ by convention: airframe-only, with battery, with gimbal, or max takeoff weight. Each is stored separately where possible."
    ],
    "anonymization_note": "Manufacturer names, model names, battery product names, and direct source URLs removed to keep the dataset generic for game use."
  },
  "classes": [
    {
      "class_id": "tiny_whoop_fpv",
      "display_name_ja": "tiny whoop / 超小型FPV",
      "design_role": "最小サイズ、高機動、低慣性、屋内寄り",
      "battery_voltage_band_v": "約3.8 V級 (1S)",
      "entries": [
        {
          "type_note": "65 mm tiny whoop FPV",
          "aircraft": {
            "weight_g": 17.3,
            "wheelbase_mm": 65,
            "propeller_note": "GF 1219S 3B (Racing/Champion) or HQ 31mm Ultralight (Freestyle)"
          },
          "battery": {
            "nominal_voltage_v": 3.8,
            "pack_count_typical": 1,
            "capacity_options_mAh": [
              260,
              300
            ],
            "battery_weight_g_example": 8.2,
            "battery_dimensions_mm_example": [
              64,
              10,
              6
            ],
            "chemistry_note": "LiHV / 1S class"
          },
          "performance": {
            "flight_time_min_example": 4
          },
          "gameplay_tags": [
            "micro",
            "indoor",
            "high agility",
            "very short endurance"
          ],
          "entry_id": "tiny_whoop_fpv_01",
          "source_basis": "official manufacturer specifications used at dataset creation time"
        }
      ]
    },
    {
      "class_id": "palm_selfie_drone",
      "display_name_ja": "palm / selfie drone",
      "design_role": "手のひらサイズ、自撮り、超軽量、安全寄り",
      "battery_voltage_band_v": "約7.3 V級 (2S相当)",
      "entries": [
        {
          "type_note": "palm-sized self-flying camera drone",
          "aircraft": {
            "takeoff_weight_g": 135,
            "dimensions_mm": [
              130,
              157,
              48.5
            ]
          },
          "battery": {
            "capacity_mAh": 1435,
            "nominal_voltage_v": 7.3,
            "max_charge_voltage_v": 8.6,
            "type": "Li-ion",
            "energy_Wh": 10.5,
            "battery_weight_g": 45,
            "pack_count_typical": 1
          },
          "performance": {
            "max_flight_time_min": 18
          },
          "gameplay_tags": [
            "selfie",
            "safe",
            "casual",
            "portable"
          ],
          "entry_id": "palm_selfie_drone_01",
          "source_basis": "official manufacturer specifications used at dataset creation time"
        }
      ]
    },
    {
      "class_id": "sub250_camera_drone",
      "display_name_ja": "sub-250 camera drone",
      "design_role": "法規制回避しやすい軽量空撮、旅行向け",
      "battery_voltage_band_v": "約7.3 V級",
      "entries": [
        {
          "type_note": "folding sub-250 g camera drone",
          "aircraft": {
            "takeoff_weight_note": "<249 g (standard battery)",
            "dimensions_folded_mm": [
              148,
              94,
              64
            ],
            "dimensions_unfolded_mm": [
              298,
              373,
              101
            ]
          },
          "battery": {
            "capacity_mAh": 2590,
            "nominal_voltage_v": 7.32,
            "max_charge_voltage_v": 8.6,
            "type": "Li-ion",
            "energy_Wh": 18.96,
            "battery_weight_g": 77.9,
            "pack_count_typical": 1,
            "plus_battery_option": {
              "capacity_mAh": 3850,
              "nominal_voltage_v": 7.38,
              "energy_Wh": 28.4,
              "battery_weight_g": 121
            }
          },
          "performance": {
            "max_flight_time_min": 34,
            "max_hover_time_min": 30
          },
          "gameplay_tags": [
            "travel",
            "regulation-friendly",
            "folding",
            "camera"
          ],
          "entry_id": "sub250_camera_drone_01",
          "source_basis": "official manufacturer specifications used at dataset creation time"
        }
      ]
    },
    {
      "class_id": "mid_size_folding_camera_drone",
      "display_name_ja": "mid-size folding camera drone",
      "design_role": "一般向け上位空撮、航続時間と画質の両立",
      "battery_voltage_band_v": "約14.6 V級 (4S)",
      "entries": [
        {
          "type_note": "folding mid-size camera drone",
          "aircraft": {
            "takeoff_weight_g": 724,
            "dimensions_folded_mm": [
              214.19,
              100.63,
              89.17
            ],
            "dimensions_unfolded_mm": [
              266.11,
              325.47,
              106.0
            ]
          },
          "battery": {
            "capacity_mAh": 4276,
            "nominal_voltage_v": 14.6,
            "max_charge_voltage_v": 17.2,
            "type": "Li-ion 4S",
            "energy_Wh": 62.5,
            "battery_weight_g": 247,
            "pack_count_typical": 1
          },
          "performance": {
            "max_flight_time_min": 45,
            "max_hover_time_min": 41,
            "max_horizontal_speed_m_s": 21
          },
          "gameplay_tags": [
            "prosumer",
            "folding",
            "longer endurance",
            "camera"
          ],
          "entry_id": "mid_size_folding_camera_drone_01",
          "source_basis": "official manufacturer specifications used at dataset creation time"
        }
      ]
    },
    {
      "class_id": "racing_fpv_5inch",
      "display_name_ja": "5-inch racing FPV",
      "design_role": "High-output 6S FPV race builds tuned for maximum speed and time attack.",
      "battery_voltage_band_v": "Approx. 22.2 V class (6S)",
      "entries": [
        {
          "entry_id": "racing_fpv_5inch_mach_r5_sport_01",
          "display_name": "iFlight Mach R5 Sport 6S",
          "model_name": "Mach R5 Sport 6S Race Analog",
          "type_note": "race-tuned 5-inch FPV quad",
          "aircraft": {
            "weight_g": 300,
            "takeoff_weight_g": 525,
            "wheelbase_mm": 210,
            "dimensions_mm": [
              148,
              148,
              51
            ]
          },
          "battery": {
            "capacity_mAh": 1400,
            "nominal_voltage_v": 22.2,
            "max_charge_voltage_v": 25.2,
            "type": "LiPo 6S",
            "energy_Wh": 31.08,
            "pack_count_typical": 1
          },
          "performance": {
            "max_flight_time_min": 12,
            "max_speed_km_h": 208
          },
          "gameplay_tags": [
            "racing",
            "fpv",
            "6s",
            "very fast",
            "time attack"
          ],
          "source_basis": "iFlight official product specifications used at dataset update time"
        },
        {
          "entry_id": "racing_fpv_5inch_geprc_racer_01",
          "display_name": "GEPRC Racer 6S",
          "model_name": "GEPRC Racer FPV Racing Drone",
          "type_note": "competition-focused 5-inch FPV race quad",
          "aircraft": {
            "weight_g": 279,
            "wheelbase_mm": 208
          },
          "battery": {
            "capacity_mAh": 1400,
            "nominal_voltage_v": 22.2,
            "max_charge_voltage_v": 25.2,
            "type": "LiPo 6S",
            "pack_count_typical": 1
          },
          "performance": {
            "max_flight_time_min": 5.5
          },
          "gameplay_tags": [
            "racing",
            "fpv",
            "6s",
            "high agility",
            "competition"
          ],
          "source_basis": "GEPRC official product specifications used at dataset update time; flight time is inferred for gameplay balance because the official page does not list a duration"
        },
        {
          "entry_id": "racing_fpv_5inch_nazgul_evoque_f5_v3_01",
          "display_name": "iFlight Nazgul Evoque F5 V3 6S",
          "model_name": "Nazgul Evoque F5 V3 6S WTFPV",
          "type_note": "high-speed 5-inch FPV quad with freestyle bias",
          "aircraft": {
            "weight_g": 460,
            "takeoff_weight_g": 704,
            "wheelbase_mm": 236,
            "dimensions_mm": [
              230,
              207,
              54
            ]
          },
          "battery": {
            "capacity_mAh": 1480,
            "nominal_voltage_v": 22.2,
            "max_charge_voltage_v": 25.2,
            "type": "LiPo 6S",
            "energy_Wh": 32.86,
            "pack_count_typical": 1
          },
          "performance": {
            "max_flight_time_min": 12.5,
            "max_speed_km_h": 190
          },
          "gameplay_tags": [
            "fpv",
            "6s",
            "very fast",
            "freestyle",
            "time attack"
          ],
          "source_basis": "iFlight official product specifications used at dataset update time"
        }
      ]
    },
    {
      "class_id": "cinema_drone",
      "display_name_ja": "cinema drone / 映画制作用",
      "design_role": "高画質ジンバル撮影、速度と剛性が必要",
      "battery_voltage_band_v": "約23.1 V級",
      "entries": [
        {
          "type_note": "professional cinema aircraft",
          "aircraft": {
            "weight_with_gimbal_camera_two_batteries_lens_ssd_propellers_g": 3995,
            "max_takeoff_weight_g": 4310,
            "diagonal_distance_mm": {
              "landing_gear_raised": 695,
              "landing_gear_lowered": 685
            },
            "travel_mode_dimensions_mm": [
              500.5,
              709.8,
              176
            ]
          },
          "battery": {
            "capacity_mAh": 4280,
            "nominal_voltage_v": 23.1,
            "type": "Li-ion",
            "energy_Wh": 98.8,
            "battery_weight_g": 470,
            "pack_count_typical": 2,
            "architecture_note": "Aircraft weight spec explicitly includes two batteries."
          },
          "performance": {
            "max_hover_time_min": 25,
            "max_flight_time_min": 28
          },
          "gameplay_tags": [
            "cinema",
            "professional",
            "high speed",
            "dual battery"
          ],
          "entry_id": "cinema_drone_01",
          "source_basis": "official manufacturer specifications used at dataset creation time"
        }
      ]
    },
    {
      "class_id": "enterprise_industrial_drone",
      "display_name_ja": "enterprise / industrial",
      "design_role": "測量、点検、産業ペイロード、耐環境性",
      "battery_voltage_band_v": "約44.76 V級",
      "entries": [
        {
          "type_note": "enterprise utility drone",
          "aircraft": {
            "dimensions_unfolded_mm": [
              810,
              670,
              430
            ],
            "dimensions_folded_mm": [
              430,
              420,
              430
            ],
            "diagonal_wheelbase_mm": 895,
            "weight_without_batteries_kg": 3.77,
            "weight_with_two_batteries_kg": 6.47,
            "max_takeoff_weight_kg": 9.2
          },
          "battery": {
            "capacity_mAh": 5880,
            "nominal_voltage_v": 44.76,
            "type": "Li-ion",
            "energy_Wh": 263.2,
            "battery_weight_kg": 1.35,
            "pack_count_typical": 2,
            "architecture_note": "Dual-battery enterprise configuration."
          },
          "performance": {
            "max_flight_time_min": 55
          },
          "gameplay_tags": [
            "inspection",
            "mapping",
            "industrial",
            "payload-capable",
            "weather-resistant"
          ],
          "entry_id": "enterprise_industrial_drone_01",
          "source_basis": "official manufacturer specifications used at dataset creation time"
        }
      ]
    },
    {
      "class_id": "legacy_heavy_hex",
      "display_name_ja": "legacy heavy-lift hex",
      "design_role": "旧世代の大型空撮・重積載プラットフォーム",
      "battery_voltage_band_v": "22.2 to 22.8 V per pack, multi-pack architecture",
      "entries": [
        {
          "type_note": "heavy-lift hexacopter",
          "aircraft": {
            "dimensions_unfolded_mm": [
              1668,
              1518,
              727
            ],
            "dimensions_folded_mm": [
              437,
              402,
              553
            ],
            "diagonal_wheelbase_mm": 1133,
            "weight_with_six_TB47S_batteries_kg": 9.5,
            "weight_with_six_TB48S_batteries_kg": 10.0,
            "recommended_max_takeoff_weight_kg": 15.5
          },
          "battery": {
            "standard_capacity_mAh": 4500,
            "standard_nominal_voltage_v": 22.2,
            "standard_energy_Wh": 99.9,
            "standard_weight_g": 595,
            "optional_capacity_mAh": 5700,
            "optional_nominal_voltage_v": 22.8,
            "optional_energy_Wh": 129.96,
            "optional_weight_g": 680,
            "pack_count_typical": 6,
            "architecture_note": "Six intelligent batteries; treat as a multi-pack system, not a simple single-pack drone."
          },
          "gameplay_tags": [
            "heavy lift",
            "hexacopter",
            "legacy pro",
            "multi-pack"
          ],
          "entry_id": "legacy_heavy_hex_01",
          "source_basis": "official manufacturer specifications used at dataset creation time"
        }
      ]
    },
    {
      "class_id": "heavy_lift_cine_rig",
      "display_name_ja": "heavy-lift cine rig",
      "design_role": "大型映画機材、特機、重積載",
      "battery_voltage_band_v": "約44.4 V級 (12S)",
      "entries": [
        {
          "type_note": "heavy-lift professional payload drone",
          "aircraft": {
            "unfolded_diameter_without_props_mm": 1415,
            "unfolded_diameter_with_props_mm": 2273,
            "folded_diameter_mm": 877,
            "height_mm": 387,
            "height_skyview_mm": 434,
            "typical_standard_empty_weight_kg": 10.86,
            "maximum_gross_takeoff_weight_kg": 34.86,
            "maximum_payload_kg": 15.06
          },
          "battery": {
            "nominal_voltage_v": 44.4,
            "battery_connectors": "XT-90",
            "pack_count_typical": 2,
            "minimum_discharge_requirement_note": "320 A per battery assuming two batteries, 20C for a 16 Ah pack",
            "example_flight_pack": {
              "capacity_Ah": 16,
              "weight_per_battery_kg": 4.47,
              "weight_pair_kg": 8.94,
              "dimensions_per_battery_mm": [
                224,
                163,
                90
              ]
            }
          },
          "gameplay_tags": [
            "very heavy lift",
            "cinema rig",
            "industrial special mission"
          ],
          "entry_id": "heavy_lift_cine_rig_01",
          "source_basis": "official manufacturer specifications used at dataset creation time"
        }
      ]
    }
  ],
  "voltage_progression_reference": [
    {
      "class_id": "tiny_whoop_fpv",
      "nominal_voltage_v_or_range": "3.8"
    },
    {
      "class_id": "palm_selfie_drone",
      "nominal_voltage_v_or_range": "7.3"
    },
    {
      "class_id": "sub250_camera_drone",
      "nominal_voltage_v_or_range": "7.32"
    },
    {
      "class_id": "mid_size_folding_camera_drone",
      "nominal_voltage_v_or_range": "14.6"
    },
    {
      "class_id": "racing_fpv_5inch",
      "nominal_voltage_v_or_range": "22.2 to 25.2 (6S)"
    },
    {
      "class_id": "cinema_drone",
      "nominal_voltage_v_or_range": "23.1 per pack x2"
    },
    {
      "class_id": "enterprise_industrial_drone",
      "nominal_voltage_v_or_range": "44.76 per pack x2"
    },
    {
      "class_id": "legacy_heavy_hex",
      "nominal_voltage_v_or_range": "22.2 to 22.8 per pack x6"
    },
    {
      "class_id": "heavy_lift_cine_rig",
      "nominal_voltage_v_or_range": "44.4, typically with two packs"
    }
  ]
};
