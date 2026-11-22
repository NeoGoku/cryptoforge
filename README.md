# CryptoForge

Mining-Management-Spiel mit isometrischen Räumen, Werkstatt und simuliertem Kryptomarkt.

```sh
npm ci
npm run dev
npm run build
```

## Betrieb

- **Stromnetz** zeigt Netzlast, Tarif und Bezug. Versorger, Akku, Lastschutz und Ausfallpläne beeinflussen die Produktion.
- **Rigs & Crew** verwaltet Standorte, Kühlung, Mitarbeiter, Mods und Mining-Coins pro Gerät. Fertig-Miner lassen sich im Shop auch leasen.
- **Wallet & Börse** enthält das Zins-Wallet und Limit-Orders. Für eine Order reservierte Beträge stehen bis zur Ausführung oder Stornierung nicht frei zur Verfügung.
- **Aufträge** enthält Tages-Challenges, Weekly Ops, Operations-Projekte und befristete Verträge.
- **Händler** bietet wechselnde Geschäfte. **Sammlungen & Prestige** bündelt Set-Boni, dauerhafte Skills und den Chip-Shop.
- **Einstellungen** enthält drei Speicherplätze und den Spielstand-Export. Bestehende CryptoForge-Spielstände öffnen sich in Platz 1.

Ein Spieltag dauert fünf Minuten aktiver Spielzeit. Kurse, Währungen und Preise sind Spielwerte. Die aus [Hashvault](https://github.com/NeoGoku/Hashvault) übernommenen Mechaniken verwenden CryptoForges Währungen, Raumplätze und Fortschritt.
