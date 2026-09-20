import React, { useState } from 'react';
import { KeyRound, ShieldCheck, ShieldAlert, Loader2, ArrowLeft, UserCog, CheckCircle2 } from 'lucide-react';
import { AuthorityUser, registerAuthority, verifyAuthorityCode, VerifiedCode } from '../../services/authApi';

interface AuthorityRegisterProps {
  onRegistered: (user: AuthorityUser) => void;
  onBack: () => void;
}

type Step = 'code' | 'details' | 'success';

/**
 * Authority Portal
 *   -> Login
 *     -> Create New Authority Account
 *       -> Enter Authority Authentication Code   (this step: `code`)
 *       -> Validate code                          (POST /auth/authority/verify-code)
 *       -> Create User ID + Password              (this step: `details`)
 *       -> Account created                        (POST /auth/authority/register)
 *       -> Authority can log in                   (auto-logged-in on success)
 *
 * The code is validated on the backend at every step; nothing here trusts
 * client-side checks alone.
 */
export const AuthorityRegister: React.FC<AuthorityRegisterProps> = ({ onRegistered, onBack }) => {
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [codeInfo, setCodeInfo] = useState<VerifiedCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const info = await verifyAuthorityCode(code.trim());
      setCodeInfo(info);
      setDesignation(info.designation || '');
      setStep('details');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify this code.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldError(null);

    if (password !== confirmPassword) {
      setFieldError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // The backend re-validates the code, username uniqueness and password
      // strength independently - this call is the real authorization check.
      const user = await registerAuthority({
        code: code.trim(),
        username: username.trim(),
        password,
        confirmPassword,
        name: name.trim(),
        designation: designation.trim() || undefined
      });
      setStep('success');
      setTimeout(() => onRegistered(user), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 bg-[#EEF2F8] border border-[#D6DEEA] rounded-xl shadow-sm p-8">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-14 h-14 rounded-full bg-[#14224A] text-[#B45309] flex items-center justify-center mb-3">
          <UserCog className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold font-heading text-[#14224A]">Create Authority Account</h2>
        <p className="text-xs text-[#5B6B84] mt-1 font-mono">
          {step === 'code' && 'STEP 1 OF 2 · AUTHENTICATION CODE'}
          {step === 'details' && 'STEP 2 OF 2 · ACCOUNT DETAILS'}
          {step === 'success' && 'ACCOUNT CREATED'}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-[#FBEAE8] border border-[#B42318]/30 text-[#B42318] text-sm rounded-lg px-3 py-2 mb-4">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === 'code' && (
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <p className="text-xs text-[#5B6B84]">
            A newly assigned inspector needs a valid Authority Authentication Code, issued by an administrator, to
            create an account. Each code works once.
          </p>
          <div>
            <label className="block text-xs font-semibold text-[#5B6B84] mb-1">Authority Authentication Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              autoFocus
              placeholder="LMPC-XXXX-XXXX-XXXX"
              className="w-full px-3 py-2 rounded-lg border border-[#D6DEEA] bg-white text-sm font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-[#14224A]/30"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full flex items-center justify-center gap-2 bg-[#14224A] text-[#F3F6FB] font-semibold text-sm py-2.5 rounded-lg hover:bg-[#14224A]/90 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            <span>{loading ? 'Validating...' : 'Validate Code'}</span>
          </button>

          <button
            type="button"
            onClick={onBack}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-[#5B6B84] hover:text-[#14224A] underline text-center pt-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to login
          </button>
        </form>
      )}

      {step === 'details' && (
        <form onSubmit={handleCreateAccount} className="space-y-3.5">
          <div className="flex items-center gap-2 bg-[#E7F5EC] border border-[#1B7A43]/30 text-[#1B7A43] text-xs rounded-lg px-3 py-2 mb-1">
            <ShieldCheck className="w-4 h-4 flex-shrink-0" />
            <span>
              Code verified{codeInfo?.district ? ` for ${codeInfo.district}` : ''}
              {codeInfo?.designation ? ` · ${codeInfo.designation}` : ''}.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5B6B84] mb-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={3}
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-[#D6DEEA] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#14224A]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5B6B84] mb-1">Designation</label>
            <input
              type="text"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="Legal Metrology Inspector"
              className="w-full px-3 py-2 rounded-lg border border-[#D6DEEA] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#14224A]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5B6B84] mb-1">Authority User ID</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              pattern="[a-zA-Z0-9._-]{4,32}"
              title="4-32 characters: letters, numbers, dot, underscore, hyphen"
              className="w-full px-3 py-2 rounded-lg border border-[#D6DEEA] bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#14224A]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5B6B84] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              className="w-full px-3 py-2 rounded-lg border border-[#D6DEEA] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#14224A]/30"
            />
            <p className="mt-1 text-[10px] text-[#8B99B0]">
              At least 10 characters, with an uppercase letter, a lowercase letter, a digit and a symbol.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5B6B84] mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-[#D6DEEA] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#14224A]/30"
            />
          </div>

          {fieldError && <p className="text-xs text-[#B42318]">{fieldError}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-[#14224A] text-[#F3F6FB] font-semibold text-sm py-2.5 rounded-lg hover:bg-[#14224A]/90 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCog className="w-4 h-4" />}
            <span>{loading ? 'Creating account...' : 'Create Authority Account'}</span>
          </button>

          <button
            type="button"
            onClick={() => setStep('code')}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-[#5B6B84] hover:text-[#14224A] underline text-center pt-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Use a different code
          </button>
        </form>
      )}

      {step === 'success' && (
        <div className="flex flex-col items-center text-center gap-3 py-4">
          <CheckCircle2 className="w-10 h-10 text-[#1B7A43]" />
          <p className="text-sm font-semibold text-[#14224A]">Account created. Logging you in...</p>
        </div>
      )}
    </div>
  );
};
