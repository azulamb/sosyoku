/*
<about-modal>
Sosyokuについて。GitHubへのリンクを含む簡易モーダル(情報表示のみなので閉じるボタン1つ)。
*/
import { t } from '../i18n/index.ts';
import { createDialogButton, createDialogFooter, createModalDialog } from '../core/dialog.ts';

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

          const updateBtn = createDialogButton(t('about.update'), 'secondary');
          updateBtn.disabled = !('serviceWorker' in navigator);
          const closeBtn = createDialogButton(t('dialog.close'), 'primary');
          const footer = createDialogFooter('space-between', [updateBtn, closeBtn]);

          body.append(heading, desc, link, updateStatus);
          const dialog = createModalDialog('min(90vw,420px)', [body, footer]);

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
