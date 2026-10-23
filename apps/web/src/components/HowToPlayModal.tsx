import React, { useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { PlayingCard } from '../ui/PlayingCard';

export interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStep?: number;
}

interface StepData {
  title: string;
  copy: string;
  illustration: React.ReactNode;
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({
  isOpen,
  onClose,
  initialStep = 0,
}) => {
  const [currentStep, setCurrentStep] = useState(initialStep);

  const steps: StepData[] = [
    {
      title: 'The goal',
      copy: 'Be the first player to get rid of all your cards.',
      illustration: (
        <div className="flex items-center justify-center gap-2 py-4">
          <PlayingCard rank="A" suit="S" size="md" className="transform -rotate-6 shadow-lg" />
          <PlayingCard rank="K" suit="H" size="md" className="transform rotate-3 shadow-lg" />
          <div className="w-16 h-22 rounded-xl border-2 border-dashed border-emerald-400/60 bg-emerald-500/10 flex flex-col items-center justify-center text-center p-1 text-emerald-300">
            <span className="text-xl">🏆</span>
            <span className="text-[10px] font-bold mt-1">Empty hand</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Your turn',
      copy: "Only you can see your cards. The game shows a rank for this turn, like Kings. Pick 1 to 4 cards and put them face down in the middle. The game announces them for you, like '2 x Kings'. The rank goes up each turn: Aces, 2s, 3s... Kings, then back to Aces.",
      illustration: (
        <div className="flex flex-col items-center gap-3 py-3">
          <div className="px-3 py-1 rounded-full bg-violet-500/20 border border-violet-400/40 text-xs font-bold text-violet-300">
            Required Rank: Kings
          </div>
          <div className="flex items-center justify-center -space-x-4">
            <PlayingCard faceDown size="md" className="transform -rotate-6 shadow-md" />
            <PlayingCard faceDown size="md" className="transform rotate-6 shadow-md" />
          </div>
          <span className="text-xs font-semibold text-[#A89BC8]">
            Announced as: &ldquo;2 x Kings&rdquo;
          </span>
        </div>
      ),
    },
    {
      title: 'You can lie',
      copy: "Your cards don't have to match! If the rank is Kings, you can play a 5 and pretend it's a King. That is a bluff.",
      illustration: (
        <div className="flex flex-col items-center gap-2 py-3">
          <div className="flex items-center justify-center -space-x-4">
            <PlayingCard faceDown label="2 x Kings" size="md" className="transform -rotate-6 shadow-md" />
            <PlayingCard faceDown label="2 x Kings" size="md" className="transform rotate-6 shadow-md" />
          </div>
          <div className="mt-2 text-center">
            <span className="text-xs text-amber-300 bg-amber-500/15 border border-amber-400/30 px-2.5 py-1 rounded-md font-medium">
              Secret: You played a 5! 🤫
            </span>
          </div>
        </div>
      ),
    },
    {
      title: 'Call bluff',
      copy: 'Think someone lied? Tap Call bluff right after they play, before the next player plays. Anyone except the player who just played can call. The cards flip over.',
      illustration: (
        <div className="flex flex-col items-center gap-3 py-3">
          <div className="flex items-center justify-center gap-3">
            <div className="animate-flip">
              <PlayingCard rank="5" suit="H" size="md" className="shadow-lg" />
            </div>
            <div className="animate-flip" style={{ animationDelay: '100ms' }}>
              <PlayingCard rank="Q" suit="S" size="md" className="shadow-lg" />
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold shadow-sm">
            🚨 Call bluff
          </div>
        </div>
      ),
    },
    {
      title: 'Who picks up the pile',
      copy: 'They lied? They take the whole pile. They told the truth? You take the whole pile. Whoever wins the call plays next.',
      illustration: (
        <div className="flex items-center justify-center gap-4 py-3">
          <div className="flex flex-col items-center p-2.5 rounded-xl bg-[#221440] border border-[rgba(167,139,250,0.18)] text-center">
            <span className="text-xs font-bold text-rose-400">Bluff caught</span>
            <span className="text-[11px] text-[#A89BC8] mt-0.5">Liar takes pile</span>
          </div>
          <span className="text-lg text-slate-500 font-bold">vs</span>
          <div className="flex flex-col items-center p-2.5 rounded-xl bg-[#221440] border border-[rgba(167,139,250,0.18)] text-center">
            <span className="text-xs font-bold text-emerald-400">Truth told</span>
            <span className="text-[11px] text-[#A89BC8] mt-0.5">Caller takes pile</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Winning',
      copy: 'Play your last card to win. Everyone then gets 10 seconds to call bluff on it. If nobody does, you win!',
      illustration: (
        <div className="flex flex-col items-center gap-2 py-3">
          <div className="relative">
            <PlayingCard rank="A" suit="H" size="md" className="shadow-lg ring-2 ring-[#F5B942]" />
            <div className="absolute -top-2 -right-3 bg-[#F5B942] text-[#0B0716] font-black text-xs px-2 py-0.5 rounded-full shadow">
              10s
            </div>
          </div>
          <span className="text-xs font-semibold text-amber-300 mt-1">
            Survive the 10s countdown to win!
          </span>
        </div>
      ),
    },
    {
      title: 'Example',
      copy: "Rohan plays 3 cards and says '3 x Fives'. Meera isn't sure and taps Call bluff. The cards flip: 5, 5 and a Queen. Rohan lied, so he picks up the whole pile. Meera plays next.",
      illustration: (
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="flex items-center justify-center -space-x-3">
            <PlayingCard rank="5" suit="H" size="sm" className="shadow" />
            <PlayingCard rank="5" suit="C" size="sm" className="shadow" />
            <PlayingCard rank="Q" suit="D" size="sm" className="shadow ring-2 ring-rose-500" />
          </div>
          <span className="text-xs font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-full mt-1">
            Queen is not a 5! Bluff caught!
          </span>
        </div>
      ),
    },
    {
      title: 'Tips',
      copy: 'Bluff sometimes, not every turn. Count cards: if you hold 3 Kings and someone plays 4 Kings, they are lying. Watch players who have few cards left.',
      illustration: (
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="text-[11px] font-semibold text-[#A89BC8]">Your hand holds:</div>
          <div className="flex items-center justify-center -space-x-3">
            <PlayingCard rank="K" suit="S" size="sm" />
            <PlayingCard rank="K" suit="H" size="sm" />
            <PlayingCard rank="K" suit="D" size="sm" />
          </div>
          <div className="text-xs text-amber-300 font-medium text-center mt-1">
            If someone claims &ldquo;4 x Kings&rdquo;, you know they lied!
          </div>
        </div>
      ),
    },
  ];

  const current = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      onClose();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleClose = () => {
    setCurrentStep(0);
    onClose();
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={handleClose}
      fullScreen={true}
      title="How to Play Bluff"
      subtitle={`Step ${currentStep + 1} of ${steps.length}`}
      aria-label="How to Play Guide"
    >
      <div className="flex flex-col justify-between h-full min-h-[380px] sm:min-h-[420px]">
        {/* Step Progress Dots */}
        <div className="flex items-center justify-center gap-1.5 py-2">
          {steps.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setCurrentStep(index)}
              aria-label={`Go to step ${index + 1}`}
              className={`h-2 rounded-full transition-all min-w-[8px] min-h-[8px] ${
                index === currentStep
                  ? 'w-6 bg-gradient-to-r from-[#7C3AED] to-[#A855F7] shadow-primary-glow'
                  : index < currentStep
                  ? 'w-2 bg-purple-400/50'
                  : 'w-2 bg-white/20'
              }`}
            />
          ))}
        </div>

        {/* Step Card Content */}
        <div className="my-auto py-4 px-2 text-center flex flex-col items-center">
          <div className="w-full max-w-xs bg-[#221440]/80 border border-[rgba(167,139,250,0.18)] rounded-2xl p-4 shadow-card mb-4 min-h-[140px] flex items-center justify-center">
            {current.illustration}
          </div>

          <h3 className="text-xl font-extrabold text-[#F5F3FF] tracking-tight mb-2">
            {current.title}
          </h3>

          <p className="text-sm text-[#A89BC8] leading-relaxed max-w-sm">
            {current.copy}
          </p>
        </div>

        {/* Stepper Navigation Footer */}
        <div className="pt-4 border-t border-[rgba(167,139,250,0.12)] space-y-2 shrink-0">
          <div className="flex items-center gap-3">
            {currentStep > 0 ? (
              <Button
                variant="secondary"
                size="md"
                onClick={handleBack}
                className="flex-1"
                aria-label="Previous step"
              >
                Back
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="md"
                onClick={handleClose}
                className="flex-1 text-[#A89BC8]"
              >
                Skip
              </Button>
            )}

            {isLastStep ? (
              <Button
                variant="primary"
                size="md"
                onClick={handleClose}
                className="flex-1"
              >
                Got it
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={handleNext}
                className="flex-1"
              >
                Next
              </Button>
            )}
          </div>

          {!isLastStep && currentStep > 0 && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="text-xs text-[#A89BC8] hover:text-[#F5F3FF] font-medium py-1 px-3 min-h-[44px]"
                style={{ touchAction: 'manipulation' }}
              >
                Skip guide
              </button>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
};
