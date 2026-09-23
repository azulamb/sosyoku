/*
<about-modal>
Sosyokuについて。GitHubへのリンクを含む簡易モーダル(情報表示のみなので閉じるボタン1つ)。
*/
import { t } from '../i18n/index.ts';

export interface AboutModalElement extends HTMLElement {
  open(): Promise<void>;
}

const REPO_URL = 'https://github.com/azulamb/sosyoku';

((script, init) => {
  const tagname = script.dataset['aboutModal'] || 'about-modal';
  if (customElements.get(tagname)) {
    return;
  }
  if (document.readyState !== 'loading') {
    return init(script, tagname);
  }
  document.addEventListener('DOMContentLoaded', () => {
    init(script, tagname);
  });
})(document.currentScript as HTMLScriptElement, (_script: HTMLScriptElement, tagname: string) => {
  customElements.define(
    tagname,
    class extends HTMLElement implements AboutModalElement {
      open(): Promise<void> {
        return new Promise((resolve) => {
          const dialog = document.createElement('dialog');
          dialog.style.cssText = 'padding:0;border:none;max-width:min(90vw,420px);width:100%;';

          const body = document.createElement('div');
          body.style.cssText = 'padding:20px;';

          const heading = document.createElement('div');
          heading.textContent = t('about.appName');
          heading.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:6px;';

          const desc = document.createElement('p');
          desc.textContent = t('about.tagline');
          desc.style.cssText = 'color:var(--text-muted);margin:0 0 16px;font-size:12px;';

          const link = document.createElement('a');
          link.href = REPO_URL;
          link.textContent = REPO_URL;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.style.cssText = 'color:var(--accent);font-size:12px;word-break:break-all;';

          const updateStatus = document.createElement('div');
          updateStatus.setAttribute('role', 'status');
          updateStatus.style.cssText = 'min-height:18px;margin-top:14px;color:var(--text-muted);font-size:12px;';

          const footer = document.createElement('div');
          footer.style.cssText =
            'display:flex;justify-content:space-between;gap:8px;padding:12px 18px;border-top:1px solid var(--border);';
          const updateBtn = document.createElement('button');
          updateBtn.type = 'button';
          updateBtn.textContent = t('about.update');
          updateBtn.disabled = !('serviceWorker' in navigator);
          updateBtn.style.cssText =
            'background:transparent;border:1px solid var(--border);border-radius:4px;padding:6px 14px;color:inherit;';
          const closeBtn = document.createElement('button');
          closeBtn.type = 'button';
          closeBtn.textContent = t('dialog.close');
          closeBtn.style.cssText =
            'background:var(--accent);color:var(--accent-contrast);border:none;border-radius:4px;padding:6px 14px;';
          footer.appendChild(updateBtn);
          footer.appendChild(closeBtn);

          body.appendChild(heading);
          body.appendChild(desc);
          body.appendChild(link);
          body.appendChild(updateStatus);
          dialog.appendChild(body);
          dialog.appendChild(footer);
          document.body.appendChild(dialog);

          const cleanup = () => {
            dialog.close();
            dialog.remove();
            resolve();
          };
          updateBtn.addEventListener('click', () => {
            void this.updatePwa(updateBtn, updateStatus);
          });
          closeBtn.addEventListener('click', cleanup);
          dialog.addEventListener('cancel', cleanup);
          dialog.addEventListener('click', (e) => {
            if (e.target === dialog) cleanup();
          });

          dialog.showModal();
        });
      }

      private async updatePwa(button: HTMLButtonElement, status: HTMLElement) {
        if (!('serviceWorker' in navigator)) {
          status.textContent = t('about.updateUnavailable');
          return;
        }

        button.disabled = true;
        status.textContent = t('about.updateChecking');
        let applying = false;
        const controllerChanged = () => {
          if (!applying) return;
          globalThis.location.reload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);

        try {
          const registration = await navigator.serviceWorker.getRegistration() ??
            await navigator.serviceWorker.register('sw.js');
          await registration.update();

          let worker = registration.waiting ?? registration.installing;
          if (worker?.state === 'installing') {
            await new Promise<void>((resolve) => {
              const onStateChange = () => {
                if (worker?.state === 'installed' || worker?.state === 'activated' || worker?.state === 'redundant') {
                  worker?.removeEventListener('statechange', onStateChange);
                  resolve();
                }
              };
              worker?.addEventListener('statechange', onStateChange);
              onStateChange();
            });
          }

          worker = registration.waiting;
          if (!worker) {
            status.textContent = t('about.updateCurrent');
            return;
          }
          if (!globalThis.confirm(t('about.updateConfirm'))) {
            status.textContent = t('about.updateReady');
            return;
          }

          applying = true;
          status.textContent = t('about.updateApplying');
          worker.postMessage({ type: 'SKIP_WAITING' });
        } catch {
          status.textContent = t('about.updateFailed');
        } finally {
          if (!applying) {
            navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged);
            button.disabled = false;
          }
        }
      }
    },
  );
});
