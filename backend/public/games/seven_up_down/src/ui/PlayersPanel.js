export class PlayersPanel {
  constructor(el) {
    this.el = el;
    this.render();
  }

  render() {
    if (!this.el) return;
    this.el.innerHTML = `
      <div class="player-pill">
        <img src="/assets/avatar/avatar_1.png" class="player-avatar" onerror="this.src='/Assets/Avatar/avatar_1.png'" />
        <div class="player-info">
          <span style="font-size: 8px; color: #fff;">🟢 Online</span>
          <span class="player-amt">Live Table</span>
        </div>
      </div>
    `;
  }
}
