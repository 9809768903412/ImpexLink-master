import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Cog } from 'lucide-react';
import type { UserRole } from '@/types';
import { apiClient } from '@/api/client';
import { resendVerification } from '@/api/auth';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PhoneInputWithCountry } from '@/components/PhoneInputWithCountry';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('+63 ');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role] = useState<UserRole>('client');
  const [companyName, setCompanyName] = useState('');
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientChoice, setClientChoice] = useState<string>('');
  const isOther = clientChoice === 'other';
  const [proofDoc, setProofDoc] = useState<File | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [otp, setOtp] = useState('');
  const [isResending, setIsResending] = useState(false);
  const { register, verifyEmail } = useAuth();
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
  const strength = getStrength(password);

  useEffect(() => {
    apiClient
      .get('/public/clients')
      .then((res) => {
        const payload = res.data || [];
        setClients(payload);
      })
      .catch(() => {
        setClients([]);
      });
  }, []);

  useEffect(() => {
    if (!clientChoice) return;
    if (clientChoice === 'other') {
      setCompanyName('');
      return;
    }
    const matched = clients.find((c) => c.id === clientChoice);
    setCompanyName(matched?.name || '');
  }, [clientChoice, clients]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Full name is required.';
    if (!email.trim()) errors.email = 'Email is required.';
    if (email && !email.includes('@')) errors.email = 'Please enter a valid email address.';
    if (!password) errors.password = 'Password is required.';
    if (password && password.length < 6) errors.password = 'Password must be at least 6 characters.';
    if (!confirmPassword) errors.confirmPassword = 'Confirm your password.';
    if (password && confirmPassword && password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    if (role === 'client' && (!clientChoice || (isOther && !companyName))) {
      errors.companyName = 'Company name is required.';
    }
    if (role === 'client' && !proofDoc) {
      errors.proofDoc = 'Proof document is required.';
    }
    if (proofDoc && proofDoc.size > 5 * 1024 * 1024) {
      errors.proofDoc = 'Maximum file size is 5MB.';
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: 'Missing fields',
        description: 'Please review the highlighted fields.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const result = await register(name, email, password, phone, role, companyName, proofDoc);
      if (result.ok && result.pending) {
        toast({
          title: 'Registration submitted',
          description: result.message || 'Check your email for a verification code.',
        });
        if (result.devOtp) {
          toast({
            title: 'Verification code (dev)',
            description: `Code: ${result.devOtp}`,
          });
        }
        setRequiresVerification(true);
        setFormErrors({});
        return;
      }
      if (result.ok) {
        toast({
          title: 'Account created!',
          description: 'Welcome to Impex Engineering.',
        });
        navigate('/');
        return;
      }
      toast({
        title: 'Registration failed',
        description: result.error || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } catch (error) {
      toast({
        title: 'Registration failed',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 6) {
      toast({
        title: 'Invalid code',
        description: 'Please enter the 6-digit verification code.',
        variant: 'destructive',
      });
      return;
    }
    setIsLoading(true);
    const ok = await verifyEmail(email, otp);
    setIsLoading(false);
    if (ok) {
      toast({
        title: 'Email verified',
        description: 'Your account is now verified. An admin may still need to approve your access.',
      });
      navigate('/login');
      return;
    }
    toast({
      title: 'Verification failed',
      description: 'Please check the code and try again.',
      variant: 'destructive',
    });
  };

  const handleResend = async () => {
    if (!email) {
      toast({
        title: 'Missing email',
        description: 'Please enter the email you registered with.',
        variant: 'destructive',
      });
      return;
    }
    setIsResending(true);
    try {
      const res = await resendVerification(email);
      toast({
        title: 'Code resent',
        description: res?.emailSent === false
          ? 'Email delivery failed. Use the code shown below.'
          : 'Please check your email for the verification code.',
      });
      if ((res as any)?.devOtp) {
        toast({
          title: 'Verification code (dev)',
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
      setIsResending(false);
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
              Join the platform that streamlines inventory management and logistics for industrial supplies.
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Register Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Logo size="lg" />
          </div>

          <Card className="border-border shadow-lg">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold text-center">Create Client Account</CardTitle>
              <CardDescription className="text-center">
                Enter your details to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!requiresVerification ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: '' }));
                    }}
                    required
                    autoComplete="name"
                  />
                  {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (formErrors.email) setFormErrors((prev) => ({ ...prev, email: '' }));
                    }}
                    required
                    autoComplete="email"
                  />
                  {formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Contact Number</Label>
                  <PhoneInputWithCountry value={phone} onChange={setPhone} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (formErrors.password) setFormErrors((prev) => ({ ...prev, password: '' }));
                      }}
                      required
                      autoComplete="new-password"
                    />
                    {password && (
                      <div className="space-y-1">
                        <div className="h-2 w-full rounded-full bg-muted">
                          <div
                            className={`h-2 rounded-full ${strength.color}`}
                            style={{ width: `${strength.percent}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">Strength: {strength.label}</p>
                      </div>
                    )}
                    {formErrors.password && <p className="text-xs text-destructive">{formErrors.password}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (formErrors.confirmPassword) setFormErrors((prev) => ({ ...prev, confirmPassword: '' }));
                      }}
                      required
                      autoComplete="new-password"
                    />
                    {formErrors.confirmPassword && (
                      <p className="text-xs text-destructive">{formErrors.confirmPassword}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Select
                    value={clientChoice}
                    onValueChange={(value) => {
                      setClientChoice(value);
                      if (formErrors.companyName) setFormErrors((prev) => ({ ...prev, companyName: '' }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your company" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {isOther && (
                    <Input
                      id="companyName"
                      type="text"
                      placeholder="Enter your company name"
                      value={companyName}
                      onChange={(e) => {
                        setCompanyName(e.target.value);
                        if (formErrors.companyName) setFormErrors((prev) => ({ ...prev, companyName: '' }));
                      }}
                      required
                      className="mt-2"
                    />
                  )}
                  {formErrors.companyName && <p className="text-xs text-destructive">{formErrors.companyName}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proofDoc">Proof of Affiliation (PDF/JPG/PNG)</Label>
                  <Input
                    id="proofDoc"
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    onChange={(e) => {
                      setProofDoc(e.target.files?.[0] || null);
                      if (formErrors.proofDoc) setFormErrors((prev) => ({ ...prev, proofDoc: '' }));
                    }}
                    required
                  />
                  {formErrors.proofDoc && <p className="text-xs text-destructive">{formErrors.proofDoc}</p>}
                  <p className="text-xs text-muted-foreground">
                    Upload company ID, COE, or any proof of affiliation (max 5MB).
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Creating account...' : 'REGISTER'}
                </Button>
              </form>
              ) : (
                <form onSubmit={handleVerify} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="otp">Email Verification Code</Label>
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
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Verifying...' : 'VERIFY EMAIL'}
                  </Button>
                  <div className="text-center text-sm text-muted-foreground">
                    Didn’t receive the code?{' '}
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={isResending}
                      className="text-primary hover:underline font-medium disabled:opacity-60"
                    >
                      {isResending ? 'Resending...' : 'Resend code'}
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">Already have an account? </span>
                <Link to="/login" className="text-primary hover:underline font-medium">
                  Log in
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
