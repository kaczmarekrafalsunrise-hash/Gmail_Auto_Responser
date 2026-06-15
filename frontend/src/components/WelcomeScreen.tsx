'use client';

import { useCallback, useEffect, useState } from 'react';
import { BrandMark } from '@/components/AppNav';

const TIMER_MS = 5000;

function BrandBolt() {
  return (
    <svg viewBox="0 0 24 32" fill="currentColor" aria-hidden="true">
      <path d="M14 0L4 18h7l-2 14 14-22h-8l1-10z" />
    </svg>
  );
}

function WelcomeBrandHeader() {
  return (
    <div className="welcome-brand-row">
      <div className="welcome-brand-mark-wrap">
        <div className="welcome-brand-orbit" aria-hidden="true" />
        <div className="welcome-brand-glow" aria-hidden="true" />
        <BrandMark />
      </div>
      <div className="welcome-brand-copy">
        <span className="revreply-wordmark">
          Re<span className="revreply-bolt"><BrandBolt /></span>Reply
        </span>
        <span className="revreply-tagline">AI Gmail Assistant</span>
      </div>
    </div>
  );
}

function WelcomeTitle({
  isNewUser,
  firstName,
}: {
  isNewUser?: boolean;
  firstName: string;
}) {
  const title = isNewUser
    ? `Welcome to ReReply, ${firstName}!`
    : `Welcome back, ${firstName}!`;

  return (
    <h2 id="welcome-title" className="welcome-title welcome-title--animated">
      <span className="welcome-title-text">
        <span className="welcome-title-base">{title}</span>
        <span className="welcome-title-shine" aria-hidden="true">
          {title}
        </span>
      </span>
    </h2>
  );
}

type Props = {
  userName?: string;
  isNewUser?: boolean;
  onClose: () => void;
};

export function WelcomeScreen({ userName, isNewUser, onClose }: Props) {
  const [closing, setClosing] = useState(false);
  const [timerDone, setTimerDone] = useState(false);
  const firstName = userName?.trim().split(/\s+/)[0] || 'there';
  const lead = isNewUser
    ? "We're excited to have you. ReReply helps you classify inbound Gmail, draft thoughtful replies, and stay in control — nothing sends until you approve it."
    : "We're glad you're here. ReReply helps you classify inbound Gmail, draft thoughtful replies, and stay in control — nothing sends until you approve it.";

  const dismiss = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 280);
  }, [closing, onClose]);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimerDone(true), TIMER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className={`welcome-overlay${closing ? ' welcome-overlay--closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className={`welcome-card${closing ? ' welcome-card--closing' : ''}`}>
        <button
          type="button"
          className={`welcome-close${timerDone ? ' welcome-close--hint' : ''}`}
          onClick={dismiss}
          aria-label="Close welcome screen"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="welcome-brand welcome-brand--animated">
          <WelcomeBrandHeader />
        </div>

        <WelcomeTitle isNewUser={isNewUser} firstName={firstName} />
        <p className="welcome-lead">{lead}</p>

        <ul className="welcome-tips">
          <li>
            <strong>Connect Gmail</strong> on Mailboxes to start syncing your inbox.
          </li>
          <li>
            <strong>Check Conversations</strong> when drafts are ready for your review.
          </li>
          <li>
            <strong>Visit Help</strong> anytime — we&apos;re here to guide you step by step.
          </li>
        </ul>

        <button type="button" className="btn btn-primary welcome-cta" onClick={dismiss}>
          Get started
        </button>

        <div className={`welcome-timer${timerDone ? ' welcome-timer--done' : ''}`} aria-hidden="true">
          <div className="welcome-timer-fill" />
        </div>
      </div>
    </div>
  );
}
