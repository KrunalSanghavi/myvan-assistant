# MyVan Assistant roadmap

Each item is tracked as a GitHub issue, grouped by milestone (`v2.1`, `v2.x`, `v3`). Issues labelled `agent-ready` can be built and verified against the demo van; `needs-van` items need the real vehicle. Tick an item here when its issue closes.

## Now: prove it on the real van (v2.1)
- [ ] First real drive with the adapter: confirm every live reading, the mode 06 self-tests and the misfire counters match what the van reports. ([#1](https://github.com/KrunalSanghavi/myvan-assistant/issues/1))
- [ ] Calibrate thresholds from your own baseline. After two weeks of drives, use your van's normal values instead of generic ones. ([#2](https://github.com/KrunalSanghavi/myvan-assistant/issues/2))
- [x] Odometer from the van, where supported (PID A6), so part ages update automatically. ([#3](https://github.com/KrunalSanghavi/myvan-assistant/issues/3))
- [x] Backup and restore of drive history, notes and maintenance to a file. ([#4](https://github.com/KrunalSanghavi/myvan-assistant/issues/4))

## Next: a better assistant (v2.x)
- [x] Phone-first redesign: four tabs, status card and live gauges on Home, list or tile view of every reading, light/dark appearance. ([#23](https://github.com/KrunalSanghavi/myvan-assistant/issues/23))
- [x] Clear codes only with the engine off and the ignition ON. ([#24](https://github.com/KrunalSanghavi/myvan-assistant/issues/24))
- [x] Freeze-frame data (mode 02): the exact conditions at the moment each code set. ([#5](https://github.com/KrunalSanghavi/myvan-assistant/issues/5))
- [ ] Spoken alerts while driving, such as "Coolant running hot." ([#6](https://github.com/KrunalSanghavi/myvan-assistant/issues/6))
- [ ] Recall and service bulletin lookup by VIN, using NHTSA's free recall data. ([#7](https://github.com/KrunalSanghavi/myvan-assistant/issues/7))
- [ ] Trip and fuel economy: MPG estimated from airflow and speed, cost per trip, idle time. ([#8](https://github.com/KrunalSanghavi/myvan-assistant/issues/8))
- [ ] Maintenance Minder companion: log each service with date, mileage and cost, with reminders when parts come due. ([#9](https://github.com/KrunalSanghavi/myvan-assistant/issues/9))
- [ ] Shareable health report page for a mechanic or a sale listing. ([#10](https://github.com/KrunalSanghavi/myvan-assistant/issues/10))
- [ ] A history screen comparing any reading across drives. ([#11](https://github.com/KrunalSanghavi/myvan-assistant/issues/11))
- [ ] "Ask about my van": plain-English questions answered from your data using an AI model. ([#12](https://github.com/KrunalSanghavi/myvan-assistant/issues/12))

## Later: deeper coverage (v3)
- [ ] Honda-specific data where the adapter allows it: transmission fluid temperature, cylinder deactivation (VCM) status, knock retard per cylinder. ([#13](https://github.com/KrunalSanghavi/myvan-assistant/issues/13))
- [ ] Transmission computer codes beyond the emissions set. ([#14](https://github.com/KrunalSanghavi/myvan-assistant/issues/14))
- [ ] Vehicle profiles, so the same app correctly monitors other cars in the family. ([#15](https://github.com/KrunalSanghavi/myvan-assistant/issues/15))
- [ ] An always-on logger in the van, for example a Raspberry Pi that records every drive and syncs over Wi-Fi at home, with no phone needed. ([#16](https://github.com/KrunalSanghavi/myvan-assistant/issues/16))
- [ ] Optional cloud sync, so phone and laptop share one history. ([#17](https://github.com/KrunalSanghavi/myvan-assistant/issues/17))
- [ ] Predictive scoring trained on your own history to estimate when a part is likely to reach its limit. ([#18](https://github.com/KrunalSanghavi/myvan-assistant/issues/18))
