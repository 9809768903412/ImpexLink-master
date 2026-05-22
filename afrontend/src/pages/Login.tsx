import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Cog, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { requestPasswordReset, resetPassword, resendOtp } from '@/api/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [otp, setOtp] = useState('');
  const [isResendingOtp, setIsResendingOtp] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'verify'>('request');
  const [resetNotice, setResetNotice] = useState('');
  const [resetFallbackOtp, setResetFallbackOtp] = useState<string | null>(null);
  const { login, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const getStrength = (value: string) => {
    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[a-z]/.test(value)) score += 1;
    if (/[A-Z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    if (score <= 2) return { label: 'Weak', color: 'bg-destructive', percent: 33 };
    if (score <= 4) return { label: 'Medium', color: 'bg-warning', percent: 66 };
    return { label: 'Strong', color: 'bg-success', percent: 100 };
  };
  const resetStrength = getStrength(resetNewPassword);

  useEffect(() => {
    const idleNotice = localStorage.getItem('auth_idle_logout');
    if (idleNotice) {
      localStorage.removeItem('auth_idle_logout');
      toast({
        title: 'Session expired',
        description: 'You were logged out due to inactivity. Please log in again.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (requiresOtp) {
        const ok = await verifyOtp(email, otp);
        if (ok) {
          toast({
            title: 'Verified',
            description: 'You are now logged in.',
          });
          navigate('/');
        } else {
          toast({
            title: 'Invalid code',
            description: 'Please check your OTP and try again.',
            variant: 'destructive',
          });
        }
        return;
      }

      localStorage.setItem('auth_remember', rememberMe ? 'true' : 'false');
      const result = await login(email, password, rememberMe);
      if (result.ok && result.requiresOtp) {
        setRequiresOtp(true);
        toast({
          title: 'OTP sent',
          description: result.message || 'Check your email for the login code.',
        });
        if (result.devOtp) {
          toast({
            title: 'Login code',
            description: `Code: ${result.devOtp}`,
          });
        }
        return;
      }
      if (result.ok) {
        toast({
          title: 'Welcome back!',
          description: 'You have been logged in successfully.',
        });
        navigate('/');
      } else {
        toast({
          title: 'Login failed',
          description: result.error || 'Invalid email or password.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Login failed',
        description:
          error?.response?.data?.error ||
          error?.message ||
          'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!email) {
      toast({
        title: 'Missing email',
        description: 'Enter your email first.',
        variant: 'destructive',
      });
      return;
    }
    setIsResendingOtp(true);
    try {
      const res = await resendOtp(email);
      toast({
        title: 'Code resent',
        description: res?.emailSent === false
          ? 'Email delivery failed. Use the code shown below.'
          : 'Check your email for the login code.',
      });
      if ((res as any)?.devOtp) {
        toast({
          title: 'Login code',
          description: `Code: ${(res as any).devOtp}`,
        });
      }
    } catch {
      toast({
        title: 'Resend failed',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setIsResendingOtp(false);
    }
  };

  const handleResendReset = async () => {
    if (!resetEmail) {
      toast({
        title: 'Missing email',
        description: 'Enter your email first.',
        variant: 'destructive',
      });
      return;
    }
    setIsLoading(true);
    try {
      const res = await requestPasswordReset(resetEmail);
      const message = res?.emailSent === false
        ? res?.message || 'The reset email could not be delivered. Please try again in a moment.'
        : res?.message || 'Check your email for the reset code.';
      setResetNotice(message);
      setResetFallbackOtp(res?.devOtp ?? null);
      toast({
        title: 'Code resent',
        description: message,
      });
      if (res?.devOtp) {
        toast({ title: 'Reset code', description: `Code: ${res.devOtp}` });
      }
    } catch (error: any) {
      toast({
        title: 'Resend failed',
        description:
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-charcoal gear-pattern relative overflow-hidden">
        <div className="absolute inset-0 flex flex-col items-center justify-center p-12">
          {/* Large decorative gears */}
          <div className="absolute top-20 left-20 opacity-10">
            <Cog size={200} className="text-primary" />
          </div>
          <div className="absolute bottom-32 right-16 opacity-10">
            <Cog size={150} className="text-secondary" />
          </div>
          <div className="absolute top-1/3 right-1/4 opacity-5">
            <Cog size={300} className="text-white" />
          </div>

          {/* Main content */}
          <div className="relative z-10 text-center">
            <div className="flex justify-center mb-8">
              <div className="flex items-center gap-4 rounded-3xl bg-white/5 px-5 py-4 backdrop-blur-sm">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl bg-white p-3">
                  <img src="/brand/impex-engineering-logo.jpeg" alt="Impex Engineering" className="h-full w-full object-contain" />
                </div>
                <div className="flex h-24 w-48 items-center justify-center overflow-hidden rounded-3xl bg-white px-6 py-3">
                  <img src="/brand/thortex-logo.jpeg" alt="Thortex Philippines" className="h-full w-full object-contain object-center" />
                </div>
              </div>
            </div>
            <h1 className="text-5xl font-bold text-white mb-4">Impex Engineering</h1>
            <p className="text-xl text-white/80 mb-2">Engineering and Industrial Supply</p>
            <p className="text-white/60 max-w-md mx-auto mt-8">
              Complete inventory, ordering, and logistics management for Impex Engineering and Industrial Supply.
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Logo size="lg" />
          </div>

          <Card className="border-border shadow-lg">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold text-center">Welcome Back</CardTitle>
              <CardDescription className="text-center">
                Enter your credentials to access your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={requiresOtp}
                  />
                </div>
                {!requiresOtp && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        className="pr-11"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showPassword}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                )}
                {requiresOtp && (
                  <div className="space-y-2">
                    <Label htmlFor="otp">Email OTP</Label>
                    <Input
                      id="otp"
                      type="text"
                      placeholder="Enter 6-digit code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                      inputMode="numeric"
                      maxLength={6}
                    />
                    <Button
                      type="button"
                      variant="link"
                      className="px-0 text-sm text-primary"
                      onClick={handleResendOtp}
                      disabled={isResendingOtp}
                    >
                      {isResendingOtp ? 'Resending...' : 'Resend code'}
                    </Button>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="remember"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                    />
                    <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                      Remember me
                    </Label>
                  </div>
                  {requiresOtp ? (
                    <span className="text-xs text-muted-foreground">Check your email for the code.</span>
                  ) : (
                    <button
                      type="button"
                      className="text-sm text-primary hover:underline"
                      onClick={() => setShowReset(true)}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Logging in...' : requiresOtp ? 'VERIFY CODE' : 'LOG IN'}
                </Button>
              </form>

              <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">Don't have an account? </span>
                <Link to="/register" className="text-primary hover:underline font-medium">
                  Register
                </Link>
              </div>

            </CardContent>
          </Card>
        </div>
      </div>
      <Dialog open={showReset} onOpenChange={setShowReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password Reset</DialogTitle>
            <DialogDescription>
              {resetStep === 'request'
                ? 'Enter your email to receive a reset code.'
                : 'Enter the reset code and your new password.'}
            </DialogDescription>
          </DialogHeader>
          {resetStep === 'request' ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="resetEmail">Email</Label>
                <Input
                  id="resetEmail"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label htmlFor="resetOtp">Reset Code</Label>
                <Input
                  id="resetOtp"
                  value={resetOtp}
                  onChange={(e) => setResetOtp(e.target.value)}
                  placeholder="6-digit code"
                  inputMode="numeric"
                  maxLength={6}
                />
                {resetNotice && (
                  <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                    {resetNotice}
                    {resetFallbackOtp && (
                      <div className="mt-2 rounded bg-white/80 px-2 py-1 font-mono text-base font-semibold tracking-[0.25em]">
                        {resetFallbackOtp}
                      </div>
                    )}
                  </div>
                )}
                <Button
                  type="button"
                  variant="link"
                  className="px-0 text-sm text-primary"
                  onClick={handleResendReset}
                >
                  Resend code
                </Button>
              </div>
              <div>
                <Label htmlFor="resetNewPassword">New Password</Label>
                <Input
                  id="resetNewPassword"
                  type="password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="Enter password"
                />
                {resetNewPassword && (
                  <div className="mt-2 space-y-1">
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className={`h-2 rounded-full ${resetStrength.color}`}
                        style={{ width: `${resetStrength.percent}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Strength: {resetStrength.label}</p>
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="resetConfirmPassword">Confirm Password</Label>
                <Input
                  id="resetConfirmPassword"
                  type="password"
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowReset(false);
                setResetStep('request');
                setResetEmail('');
                setResetOtp('');
                setResetNewPassword('');
                setResetConfirmPassword('');
                setResetNotice('');
                setResetFallbackOtp(null);
              }}
            >
              Cancel
            </Button>
            {resetStep === 'request' ? (
              <Button
                onClick={async () => {
                  if (!resetEmail || !resetEmail.includes('@')) {
                    toast({ title: 'Invalid email', description: 'Enter a valid email.', variant: 'destructive' });
                    return;
                  }
                  try {
                    const res = await requestPasswordReset(resetEmail);
                    const message = res?.emailSent === false
                      ? res?.message || 'The reset email could not be delivered. Please try again in a moment.'
                      : res?.message || 'Check your email for the reset code.';
                    setResetNotice(message);
                    setResetFallbackOtp(res?.devOtp ?? null);
                    setResetStep('verify');
                    toast({ title: res?.emailSent === false ? 'Reset code pending' : 'Reset code sent', description: message });
                    if (res?.devOtp) {
                      toast({ title: 'Reset code', description: `Code: ${res.devOtp}` });
                    }
                  } catch (error: any) {
                    toast({
                      title: 'Reset email failed',
                      description:
                        error?.response?.data?.message ||
                        error?.response?.data?.error ||
                        'Please try again in a moment.',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                Send Code
              </Button>
            ) : (
              <Button
                onClick={async () => {
                  if (!resetOtp || resetOtp.length < 6) {
                    toast({ title: 'Invalid code', description: 'Enter the 6-digit code.', variant: 'destructive' });
                    return;
                  }
                  if (!resetNewPassword || resetNewPassword.length < 6) {
                    toast({ title: 'Weak password', description: 'Password must be at least 6 characters.', variant: 'destructive' });
                    return;
                  }
                  if (resetNewPassword !== resetConfirmPassword) {
                    toast({ title: 'Mismatch', description: 'Passwords do not match.', variant: 'destructive' });
                    return;
                  }
                  try {
                    await resetPassword(resetEmail, resetOtp, resetNewPassword);
                    toast({ title: 'Password updated', description: 'You can now log in.' });
                    setShowReset(false);
                    setResetStep('request');
                    setResetEmail('');
                    setResetOtp('');
                    setResetNewPassword('');
                    setResetConfirmPassword('');
                    setResetNotice('');
                    setResetFallbackOtp(null);
                  } catch (error: any) {
                    toast({
                      title: 'Password reset failed',
                      description:
                        error?.response?.data?.error ||
                        error?.response?.data?.message ||
                        'Please check the code and try again.',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                Reset Password
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
