import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
//import Gio from 'gi://Gio';

export default class EAlarmExtension extends Extension {
    enable() {
        this._indicator = new PanelMenu.Button(0.0, 'Earthquake Alarm');

        // === Icon + Label ===
        this._icon = new St.Icon({
            icon_name: 'dialog-warning-symbolic',
            style_class: 'system-status-icon',
        });
        this._label = new St.Label({
            text: 'No Alert',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'padding-left: 4px; font-weight: bold;',
        });

        let box = new St.BoxLayout({ vertical: false });
        box.add_child(this._icon);
        box.add_child(this._label);
        this._indicator.add_child(box);

        // === Menu ===
        let checkItem = new PopupMenu.PopupMenuItem('Check Latest Earthquake');
        checkItem.connect('activate', () => this._checkEarthquake(true));
        this._indicator.menu.addMenuItem(checkItem);

        this._soundList = [
            'dialog-warning',
            'bell',
            'alarm-clock-elapsed',
            'suspend-error',
        ];
        this._currentSound = 0;

        this._soundItem = new PopupMenu.PopupMenuItem(
            `Change Sound (current: ${this._soundList[this._currentSound]})`
        );
        this._soundItem.connect('activate', () => {
            this._currentSound = (this._currentSound + 1) % this._soundList.length;
            this._soundItem.label.text =
                `Change Sound (current: ${this._soundList[this._currentSound]})`;
            Main.notify(
                'Earthquake Alarm',
                `Notification sound set to "${this._soundList[this._currentSound]}"`
            );
        });
        this._indicator.menu.addMenuItem(this._soundItem);

        let aboutItem = new PopupMenu.PopupMenuItem('About Earthquake Alarm');
        aboutItem.connect('activate', () => {
            Main.notify('Earthquake Alarm', 'Extension by asek.rf.gd');
        });
        this._indicator.menu.addMenuItem(aboutItem);

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // === State ===
        this._session = new Soup.Session();
        this._lastQuakeId = null;
        this._flashTimeout = null;

        // auto polling every 60s
        this._pollId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            this._checkEarthquake();
            return GLib.SOURCE_CONTINUE;
        });

        // first run
        this._checkEarthquake();
        Main.notify('Earthquake Alarm', 'Monitoring BMKG feed for earthquake alerts.');
    }

    disable() {
        if (this._pollId) {
            GLib.source_remove(this._pollId);
            this._pollId = null;
        }
        if (this._flashTimeout) {
            GLib.source_remove(this._flashTimeout);
            this._flashTimeout = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._soundItem = null;
        this._label = null;
        this._icon = null;
        this._session = null;
    }

    async _checkEarthquake(manual = false) {
        try {
            const url = 'https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json';
            let msg = Soup.Message.new('GET', url);

            this._session.send_and_read_async(
                msg,
                GLib.PRIORITY_DEFAULT,
                null,
                (session, res) => {
                    try {
                        let bytes = this._session.send_and_read_finish(res);
                        let jsonStr = new TextDecoder().decode(bytes.get_data());
                        let data = JSON.parse(jsonStr);
                        let quake = data.Infogempa?.gempa;
                        if (!quake) return;

                        let quakeId = quake.Tanggal + quake.Jam;
                        if (manual || quakeId !== this._lastQuakeId) {
                            this._lastQuakeId = quakeId;

                            let message =
                                `Magnitude: ${quake.Magnitude} SR\n` +
                                `Depth: ${quake.Kedalaman}\n` +
                                `Location: ${quake.Dirasakan}`;
                            Main.notify('BMKG Earthquake Alert', message);

                            this._label.text = `M ${quake.Magnitude} SR`;

                            // === Play selected alert sound from theme ===
                            let soundName = this._soundList[this._currentSound];
                            let player = global.display.get_sound_player();
                            player.play_from_theme(soundName, 'Earthquake Alert', null);

                            // flash effect
                            this._startFlashing();
                        }
                    } catch (e) {
                        logError(e);
                    }
                }
            );
        } catch (e) {
            logError(e);
        }
    }

    _startFlashing() {
        if (this._flashTimeout) {
            GLib.source_remove(this._flashTimeout);
            this._flashTimeout = null;
        }
        let visible = true;
        this._flashTimeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            visible = !visible;
            this._icon.opacity = visible ? 255 : 50;
            this._label.opacity = visible ? 255 : 50;
            return GLib.SOURCE_CONTINUE;
        });
    }
}
