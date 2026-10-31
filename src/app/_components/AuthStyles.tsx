/**
 * Shared styles for the /login and /signup pages.
 *
 * Extracted from login/page.tsx so both auth screens stay visually identical
 * without duplicating the stylesheet.
 */
export default function AuthStyles() {
  return (
    <style>{`
      * { box-sizing: border-box; }

      body {
        margin: 0;
        font-family: 'Inter', 'Segoe UI', sans-serif;
        background: #0a0f1e;
      }

      .login-container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        background:
          radial-gradient(ellipse at 20% 50%, rgba(99,102,241,0.15) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 20%, rgba(16,185,129,0.12) 0%, transparent 50%),
          #0a0f1e;
      }

      .login-card {
        width: 100%;
        max-width: 420px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 20px;
        padding: 2.5rem 2rem;
        backdrop-filter: blur(20px);
        box-shadow:
          0 0 0 1px rgba(99,102,241,0.1),
          0 32px 64px rgba(0,0,0,0.5),
          inset 0 1px 0 rgba(255,255,255,0.08);
        animation: slideUp 0.4s ease-out;
      }

      @keyframes slideUp {
        from { opacity: 0; transform: translateY(24px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      .login-logo { text-align: center; margin-bottom: 2rem; }

      .logo-icon { font-size: 2.5rem; display: block; margin-bottom: 0.5rem; }

      .logo-title {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 700;
        background: linear-gradient(135deg, #6366f1, #10b981);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        letter-spacing: -0.02em;
      }

      .logo-subtitle {
        margin: 0.25rem 0 0;
        font-size: 0.75rem;
        color: rgba(255,255,255,0.4);
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .login-heading {
        margin: 0 0 0.25rem;
        font-size: 1.35rem;
        font-weight: 600;
        color: rgba(255,255,255,0.95);
        letter-spacing: -0.01em;
      }

      .login-subheading {
        margin: 0 0 1.75rem;
        font-size: 0.875rem;
        color: rgba(255,255,255,0.45);
      }

      .login-form { display: flex; flex-direction: column; gap: 1.25rem; }

      .form-group { display: flex; flex-direction: column; gap: 0.5rem; }

      /* Two inputs side by side on wider screens, stacked on mobile. */
      .form-row { display: flex; gap: 0.75rem; }
      .form-row > .form-group { flex: 1; min-width: 0; }
      @media (max-width: 420px) { .form-row { flex-direction: column; gap: 1.25rem; } }

      .form-label {
        font-size: 0.8rem;
        font-weight: 500;
        color: rgba(255,255,255,0.6);
        letter-spacing: 0.02em;
      }

      .form-input {
        padding: 0.75rem 1rem;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px;
        color: rgba(255,255,255,0.95);
        font-size: 0.9rem;
        transition: border-color 0.2s, box-shadow 0.2s;
        outline: none;
        width: 100%;
      }

      .form-input::placeholder { color: rgba(255,255,255,0.25); }

      .form-input:focus {
        border-color: rgba(99,102,241,0.6);
        box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
      }

      .form-hint {
        font-size: 0.72rem;
        color: rgba(255,255,255,0.35);
      }

      .form-error {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        background: rgba(239,68,68,0.12);
        border: 1px solid rgba(239,68,68,0.3);
        border-radius: 10px;
        color: #fca5a5;
        font-size: 0.85rem;
        animation: shake 0.3s ease;
      }

      @keyframes shake {
        0%,100% { transform: translateX(0); }
        25%      { transform: translateX(-4px); }
        75%      { transform: translateX(4px); }
      }

      .btn-primary {
        padding: 0.875rem 1rem;
        background: linear-gradient(135deg, #6366f1, #4f46e5);
        border: none;
        border-radius: 10px;
        color: #fff;
        font-size: 0.95rem;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s, transform 0.1s, box-shadow 0.2s;
        box-shadow: 0 4px 16px rgba(99,102,241,0.4);
        margin-top: 0.25rem;
      }

      .btn-primary:hover:not(:disabled) {
        opacity: 0.9;
        box-shadow: 0 6px 24px rgba(99,102,241,0.5);
        transform: translateY(-1px);
      }

      .btn-primary:active:not(:disabled) { transform: translateY(0); }
      .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

      .btn-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
      }

      .spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }

      @keyframes spin { to { transform: rotate(360deg); } }

      .login-footer {
        text-align: center;
        margin: 1.5rem 0 0;
        font-size: 0.85rem;
        color: rgba(255,255,255,0.4);
      }

      .link {
        color: #818cf8;
        text-decoration: none;
        font-weight: 500;
        transition: color 0.2s;
      }

      .link:hover { color: #a5b4fc; text-decoration: underline; }
    `}</style>
  );
}
