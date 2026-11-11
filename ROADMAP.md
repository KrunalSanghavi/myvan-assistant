# MyVan Assistant roadmap

## Now: prove it on the real van (v2.1)
- [ ] First real drive with the adapter: confirm every live reading, the mode 06 self-tests and the misfire counters match what the van reports.
- [ ] Calibrate thresholds from your own baseline. After two weeks of drives, use your van's normal values instead of generic ones.
- [ ] Odometer from the van, where supported (PID A6), so part ages update automatically.
- [ ] Backup and restore of drive history, notes and maintenance to a file.

## Next: a better assistant (v2.x)
- [ ] Freeze-frame data (mode 02): the exact conditions at the moment each code set.
- [ ] Spoken alerts while driving, such as "Coolant running hot."
- [ ] Recall and service bulletin lookup by VIN, using NHTSA's free recall data.
- [ ] Trip and fuel economy: MPG estimated from airflow and speed, cost per trip, idle time.
- [ ] Maintenance Minder companion: log each service with date, mileage and cost, with reminders when parts come due.
- [ ] Shareable health report page for a mechanic or a sale listing.
- [ ] A history screen comparing any reading across drives.
- [ ] "Ask about my van": plain-English questions answered from your data using an AI model.

## Later: deeper coverage (v3)
- [ ] Honda-specific data where the adapter allows it: transmission fluid temperature, cylinder deactivation (VCM) status, knock retard per cylinder.
- [ ] Transmission computer codes beyond the emissions set.
- [ ] Vehicle profiles, so the same app correctly monitors other cars in the family.
- [ ] An always-on logger in the van, for example a Raspberry Pi that records every drive and syncs over Wi-Fi at home, with no phone needed.
- [ ] Optional cloud sync, so phone and laptop share one history.
- [ ] Predictive scoring trained on your own history to estimate when a part is likely to reach its limit.
