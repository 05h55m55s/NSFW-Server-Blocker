/**
 * @name NSFW Server Blocker
 * @version 1.0.0
 * @description [EN] Automatically leaves servers containing NSFW/Age-Restricted channels to keep your account safe. [AR] يغادر تلقائياً من السيرفرات التي تحتوي على قنوات إباحية أو مخصصة للبالغين للحفاظ على سلامة حسابك.
 * @author p_4v
 * @authorId 384496246028763146
 * @website https://github.com/05h55m55s/NSFW-Server-Blocker
 * @source https://raw.githubusercontent.com/05h55m55s/NSFW-Server-Blocker/main/NSFWServerBlocker.plugin.js
 */

module.exports = class NSFWServerBlocker {
    constructor(meta) {
        this.meta = meta;
        this.checkNewGuild = this.checkNewGuild.bind(this);
        this.runFullScan = this.runFullScan.bind(this);
        this.scanInterval = null;
    }

    start() {
        this.loadModules();

        if (!this.GuildStore || !this.ChannelStore || !this.leaveGuildFunc || !this.UserStore) {
            console.error(`${this.meta.name}: Missing critical modules.`);
            BdApi.UI.showToast(`${this.meta.name}: Error loading modules.`, {type: "error"});
            return;
        }

        // Initial Scan
        this.runFullScan();

        // Events
        this.Dispatcher.subscribe("GUILD_CREATE", this.checkNewGuild);

        // Periodic Scan (30 mins)
        this.scanInterval = setInterval(this.runFullScan, 1800000);
        
        BdApi.UI.showToast(`🛡️ ${this.meta.name} Active`, {type: "success"});
    }

    stop() {
        if (this.Dispatcher) this.Dispatcher.unsubscribe("GUILD_CREATE", this.checkNewGuild);
        if (this.scanInterval) clearInterval(this.scanInterval);
    }

    loadModules() {
        this.GuildStore = BdApi.Webpack.getStore("GuildStore");
        this.UserStore = BdApi.Webpack.getStore("UserStore");
        this.ChannelStore = BdApi.Webpack.getStore("GuildChannelStore") || 
                            BdApi.Webpack.getStore("ChannelStore") || 
                            BdApi.Webpack.getModule(m => m.getChannels);
        
        const GuildActions = BdApi.Webpack.getModule(m => m.leaveGuild, {searchExports: true});
        this.leaveGuildFunc = GuildActions ? GuildActions.leaveGuild : BdApi.Webpack.getByKeys("leaveGuild")?.leaveGuild;
        
        this.Dispatcher = BdApi.Webpack.getModule(m => m.dispatch && m.subscribe, {searchExports: true});
    }

    extractChannels(guildId) {
        let rawData = null;
        if (typeof this.ChannelStore.getChannels === 'function') rawData = this.ChannelStore.getChannels(guildId);
        else if (typeof this.ChannelStore.getGuildChannels === 'function') rawData = this.ChannelStore.getGuildChannels(guildId);

        if (!rawData) return [];

        let channels = [];
        if (Array.isArray(rawData)) channels = rawData;
        else if (rawData instanceof Map) channels = Array.from(rawData.values());
        else if (typeof rawData === 'object') {
            Object.values(rawData).forEach(val => {
                if (Array.isArray(val)) {
                    val.forEach(item => {
                        if (item?.id) channels.push(item);
                        else if (item?.channel?.id) channels.push(item.channel);
                    });
                } else if (val?.id) channels.push(val);
                else if (val?.channel?.id) channels.push(val.channel);
            });
        }
        return channels.filter(c => c && c.id);
    }

    processServerCheck(guildId, guildName) {
        const guild = this.GuildStore.getGuild(guildId);
        const currentUser = this.UserStore.getCurrentUser();
        
        // Owner Protection
        if (guild && currentUser && guild.ownerId === currentUser.id) return false;

        const channels = this.extractChannels(guildId);
        const badKeywords = ["nsfw", "xxx", "porn", "sex", "18+", "🔞", "adult-only", "nudes"];

        const isBad = channels.some(c => {
            if (!c) return false;
            if (c.nsfw === true) return true;
            if (c.name && typeof c.name === 'string') {
                const name = c.name.toLowerCase();
                if (badKeywords.some(k => name.includes(k))) return true;
            }
            return false;
        });

        if (isBad) {
            console.warn(`[${this.meta.name}] Leaving: ${guildName}`);
            try {
                this.leaveGuildFunc(guildId);
                BdApi.UI.showToast(`⚠️ Auto-Left: ${guildName}`, {type: "error", icon: true});
                return true;
            } catch (err) {
                console.error("Leave failed:", err);
            }
        }
        return false;
    }

    runFullScan() {
        const guilds = Object.values(this.GuildStore.getGuilds());
        guilds.forEach((guild, index) => {
            if (!guild) return;
            setTimeout(() => {
                this.processServerCheck(guild.id, guild.name);
            }, index * 600); 
        });
    }

    checkNewGuild(event) {
        if (!event || !event.guild) return;
        setTimeout(() => {
            this.processServerCheck(event.guild.id, event.guild.name);
        }, 3000);
    }

};
