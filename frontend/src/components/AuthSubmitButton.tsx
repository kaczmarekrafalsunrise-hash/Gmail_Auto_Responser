'use client';

type Props = {
  loading: boolean;
  loadingLabel: string;
  label: string;
};

export function AuthSubmitButton({ loading, loadingLabel, label }: Props) {
  return (
    <button
      type="submit"
      className={`btn btn-primary auth-submit-btn${loading ? ' auth-submit-btn--loading' : ''}`}
      style={{ width: '100%' }}
      disabled={loading}
      aria-busy={loading}
    >
      <span>{loading ? loadingLabel : label}</span>
      {loading && (
        <span className="auth-submit-btn__bar" aria-hidden="true">
          <span className="auth-submit-btn__bar-fill" />
        </span>
      )}
    </button>
  );
}
