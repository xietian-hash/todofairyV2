const HIDE_ANIMATION_MS = 200;

Component({
  properties: {
    top: {
      type: Number,
      value: 0,
    },
  },

  data: {
    visible: false,
    active: false,
    text: "",
    type: "success",
  },

  lifetimes: {
    detached() {
      if (this._hideTimer) {
        clearTimeout(this._hideTimer);
        this._hideTimer = null;
      }
      if (this._destroyTimer) {
        clearTimeout(this._destroyTimer);
        this._destroyTimer = null;
      }
    },
  },

  methods: {
    show(options = {}) {
      const text = String(options.text || "").trim();
      if (!text) {
        return;
      }
      const type = options.type || "success";
      const duration = Number(options.duration) || 1800;

      if (this._hideTimer) {
        clearTimeout(this._hideTimer);
        this._hideTimer = null;
      }
      if (this._destroyTimer) {
        clearTimeout(this._destroyTimer);
        this._destroyTimer = null;
      }

      this.setData({
        visible: true,
        active: true,
        text,
        type,
      });

      this._hideTimer = setTimeout(() => {
        this._hideTimer = null;
        this.hide();
      }, duration);
    },

    hide() {
      if (!this.data.visible) {
        return;
      }

      this.setData({
        active: false,
      });

      this._destroyTimer = setTimeout(() => {
        this._destroyTimer = null;
        this.setData({
          visible: false,
          text: "",
        });
      }, HIDE_ANIMATION_MS);
    },
  },
});
