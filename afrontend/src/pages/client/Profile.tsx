import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { User, Building, Bell, Shield, Save, CreditCard, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { resendVerification } from '@/api/auth';
import { useResource } from '@/hooks/use-resource';
import type { Client, Order } from '@/types';
import { apiClient } from '@/api/client';

export default function ClientProfilePage() {
  const { user, updateUser, refreshUser } = useAuth();
  const { data: clients } = useResource<Client[]>('/clients', []);
  const [orders, setOrders] = useState<Order[]>([]);
  
  const client = clients.find((c) => c.id === user?.clientId);
  const clientOrders = orders;
  const totalSpend = clientOrders.reduce((sum, o) => sum + o.total, 0);

  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    avatarUrl: user?.avatarUrl || '',
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

  const [companyData, setCompanyData] = useState({
    name: client?.name || '',
    address: client?.address || '',
    tin: client?.tin || '',
    visibilityScope: client?.visibilityScope || 'company',
  });

  const [notifications, setNotifications] = useState({
    orderUpdates: true,
    deliveryAlerts: true,
    stockAlerts: false,
    promotions: true,
    twoFactorEnabled: true,
  });
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [isResendingVerify, setIsResendingVerify] = useState(false);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    apiClient
      .get('/orders')
      .then((res) => setOrders(res.data?.data || res.data || []))
      .catch(() => setOrders([]));
  }, [user?.id]);

  useEffect(() => {
    apiClient
      .get('/users/me')
      .then((res) => {
        if (res?.data) {
          setProfileData({
            name: res.data.name || '',
            email: res.data.email || '',
            phone: res.data.phone || '',
            avatarUrl: res.data.avatarUrl || '',
          });
          if (res.data.notificationPrefs) {
            setNotifications(res.data.notificationPrefs);
          }
        }
      })
      .catch(() => {
        // keep local state
      });
  }, []);

  useEffect(() => {
    setCompanyData({
      name: client?.name || '',
      address: client?.address || '',
      tin: client?.tin || '',
      visibilityScope: client?.visibilityScope || 'company',
    });
  }, [client?.id]);

  const handleSaveProfile = () => {
    const errors: Record<string, string> = {};
    if (!profileData.name.trim()) errors.name = 'Full name is required.';
    if (profileData.email && !profileData.email.includes('@')) errors.email = 'Enter a valid email.';
    setProfileErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({ title: 'Fix validation errors', description: 'Please review the highlighted fields.', variant: 'destructive' });
      return;
    }
    const initials = (profileData.name || '')
      .split(' ')
      .filter(Boolean)
      .map((part: string) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    updateUser({
      name: profileData.name,
      email: profileData.email,
      phone: profileData.phone,
      avatarUrl: profileData.avatarUrl,
      avatar: initials || user?.avatar,
    });
    apiClient
      .put('/users/me', profileData)
      .then((res) => {
        const initials = (res.data.name || '')
          .split(' ')
          .filter(Boolean)
          .map((part: string) => part[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        updateUser({
          name: res.data.name,
          email: res.data.email,
          phone: res.data.phone,
          avatarUrl: res.data.avatarUrl,
          avatar: initials || user?.avatar,
        });
        refreshUser();
        if (res.data?.requiresVerification) {
          toast({
            title: 'Email verification required',
            description: 'Check your email for a verification code.',
          });
          setIsVerifyOpen(true);
        }
      })
      .catch(() => {
        // keep optimistic UI
      });
    toast({
      title: 'Profile Updated',
      description: 'Your profile has been saved successfully',
    });
  };

  const handlePhotoChange = (file: File | null) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: 'Image too large',
        description: 'Please upload a file smaller than 2MB.',
        variant: 'destructive',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      const nextProfile = { ...profileData, avatarUrl: result };
      setProfileData(nextProfile);
      const initials = (nextProfile.name || '')
        .split(' ')
        .filter(Boolean)
        .map((part: string) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
      updateUser({
        name: nextProfile.name,
        email: nextProfile.email,
        phone: nextProfile.phone,
        avatarUrl: nextProfile.avatarUrl,
        avatar: initials || user?.avatar,
      });
      apiClient
        .put('/users/me', nextProfile)
        .then((res) => {
          updateUser({
            name: res.data.name,
            email: res.data.email,
            phone: res.data.phone,
            avatarUrl: res.data.avatarUrl,
            avatar: initials || user?.avatar,
          });
          refreshUser();
        })
        .catch(() => {
          // keep optimistic UI
        });
      toast({
        title: 'Photo Updated',
        description: 'Your profile photo has been updated.',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCompany = () => {
    if (!client?.id) return;
    if (!companyData.name) {
      toast({ title: 'Company name required', description: 'Please enter your company name.', variant: 'destructive' });
      return;
    }
    if (!companyData.address) {
      toast({ title: 'Company address required', description: 'Please enter your company address.', variant: 'destructive' });
      return;
    }
    apiClient
      .put(`/clients/${client.id}`, {
        clientName: companyData.name,
        address: companyData.address,
        email: profileData.email,
        visibilityScope: companyData.visibilityScope,
      })
      .then(() => refreshUser())
      .catch(() => {
        // keep optimistic UI
      });
    toast({
      title: 'Company Updated',
      description: 'Company information has been saved successfully',
    });
  };

  const handleSaveNotifications = () => {
    apiClient.put('/users/me/notifications', notifications).catch(() => {
      // keep optimistic UI
    });
    toast({
      title: 'Preferences Saved',
      description: 'Notification preferences updated',
    });
  };

  const handleChangePassword = () => {
    const errors: Record<string, string> = {};
    if (!passwordForm.currentPassword) errors.currentPassword = 'Current password is required.';
    if (!passwordForm.newPassword) errors.newPassword = 'New password is required.';
    if (passwordForm.newPassword && passwordForm.newPassword.length < 6) {
      errors.newPassword = 'Password must be at least 6 characters.';
    }
    if (!passwordForm.confirmPassword) errors.confirmPassword = 'Please confirm your password.';
    if (
      passwordForm.newPassword &&
      passwordForm.confirmPassword &&
      passwordForm.newPassword !== passwordForm.confirmPassword
    ) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: 'Fix validation errors',
        description: 'Please review the highlighted fields.',
        variant: 'destructive',
      });
      return;
    }
    apiClient
      .put('/users/me/password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      .then(() => {
        toast({
          title: 'Password Updated',
          description: 'Your password has been changed successfully.',
        });
        setIsPasswordOpen(false);
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      })
      .catch(() => {
        toast({
          title: 'Password update failed',
          description: 'Please check your current password and try again.',
          variant: 'destructive',
        });
      });
  };

  const handleVerifyEmail = async () => {
    if (!verifyCode || verifyCode.length < 6 || !profileData.email) {
      toast({
        title: 'Invalid code',
        description: 'Enter the 6-digit verification code sent to your email.',
        variant: 'destructive',
      });
      return;
    }
    const ok = await apiClient.post('/auth/verify-email', { email: profileData.email, otp: verifyCode });
    if (ok?.data?.ok) {
      toast({ title: 'Email verified', description: 'Your email is now verified.' });
      setIsVerifyOpen(false);
      setVerifyCode('');
      refreshUser();
    } else {
      toast({
        title: 'Verification failed',
        description: 'Please check the code and try again.',
        variant: 'destructive',
      });
    }
  };

  const handleResendVerifyEmail = async () => {
    if (!profileData.email) {
      toast({
        title: 'Missing email',
        description: 'Please add your email first.',
        variant: 'destructive',
      });
      return;
    }
    setIsResendingVerify(true);
    try {
      const res = await resendVerification(profileData.email);
      toast({
        title: 'Code resent',
        description: res?.emailSent === false
          ? 'Email delivery failed. Use the code shown below.'
          : 'Check your email for the verification code.',
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
      setIsResendingVerify(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">My Profile</h2>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Profile Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User size={20} />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  {profileData.avatarUrl && (
                    <AvatarImage src={profileData.avatarUrl} alt={profileData.name || 'User'} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                    {user?.avatar}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif"
                    className="hidden"
                    onChange={(e) => handlePhotoChange(e.target.files?.[0] || null)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change Photo
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPG, PNG or GIF. Max 2MB.
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Full Name</Label>
                  <Input
                    value={profileData.name}
                    onChange={(e) => {
                      setProfileData({ ...profileData, name: e.target.value });
                      if (profileErrors.name) setProfileErrors((prev) => ({ ...prev, name: '' }));
                    }}
                    className="mt-1"
                  />
                  {profileErrors.name && <p className="text-xs text-destructive mt-1">{profileErrors.name}</p>}
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={profileData.email}
                    onChange={(e) => {
                      setProfileData({ ...profileData, email: e.target.value });
                      if (profileErrors.email) setProfileErrors((prev) => ({ ...prev, email: '' }));
                    }}
                    className="mt-1"
                  />
                  {profileErrors.email && <p className="text-xs text-destructive mt-1">{profileErrors.email}</p>}
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={profileData.phone}
                    onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveProfile}>
                  <Save size={16} className="mr-2" />
                  Save Changes
                </Button>
              </div>
              {user?.emailVerified === false && (
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">Email Verification Required</p>
                    <p className="text-sm text-muted-foreground">Verify your email to keep access.</p>
                  </div>
                  <Button variant="outline" onClick={() => setIsVerifyOpen(true)}>
                    Verify Email
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Company Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building size={20} />
                Company Information
              </CardTitle>
              <CardDescription>
                This information appears on your invoices and delivery documents
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Company Name</Label>
                <Input
                  value={companyData.name}
                  onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Address</Label>
                <Input
                  value={companyData.address}
                  onChange={(e) => setCompanyData({ ...companyData, address: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>TIN</Label>
                <Input
                  value={companyData.tin}
                  onChange={(e) => setCompanyData({ ...companyData, tin: e.target.value })}
                  className="mt-1"
                  placeholder="XXX-XXX-XXX-XXXXX"
                />
              </div>
              <div>
                <Label>Order Visibility</Label>
                <Select
                  value={companyData.visibilityScope}
                  onValueChange={(value: 'company' | 'user') =>
                    setCompanyData({ ...companyData, visibilityScope: value })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choose visibility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Company-wide</SelectItem>
                    <SelectItem value="user">My own only</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Company-wide shows all orders and deliveries for your company. My own only shows just the records you created.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleSaveCompany}>
                  <Save size={16} className="mr-2" />
                  Save Company Info
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Notification Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell size={20} />
                Notification Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Order Updates</p>
                  <p className="text-sm text-muted-foreground">
                    Get notified when your orders are processed
                  </p>
                </div>
                <Switch
                  checked={notifications.orderUpdates}
                  onCheckedChange={(v) => setNotifications({ ...notifications, orderUpdates: v })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Delivery Alerts</p>
                  <p className="text-sm text-muted-foreground">
                    Track your deliveries in real-time
                  </p>
                </div>
                <Switch
                  checked={notifications.deliveryAlerts}
                  onCheckedChange={(v) => setNotifications({ ...notifications, deliveryAlerts: v })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Low Stock Alerts</p>
                  <p className="text-sm text-muted-foreground">
                    Know when your frequently ordered items are low
                  </p>
                </div>
                <Switch
                  checked={notifications.stockAlerts}
                  onCheckedChange={(v) => setNotifications({ ...notifications, stockAlerts: v })}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Promotions & Updates</p>
                  <p className="text-sm text-muted-foreground">
                    Special offers and new product announcements
                  </p>
                </div>
                <Switch
                  checked={notifications.promotions}
                  onCheckedChange={(v) => setNotifications({ ...notifications, promotions: v })}
                />
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={handleSaveNotifications}>
                  <Save size={16} className="mr-2" />
                  Save Preferences
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield size={20} />
                Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="font-medium">Password</p>
                  <p className="text-sm text-muted-foreground">Last changed 30 days ago</p>
                </div>
                <Button variant="outline" onClick={() => setIsPasswordOpen(true)}>
                  Change Password
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Account Summary */}
        <div className="space-y-6">
          {/* Account Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Account Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center p-4 bg-primary/10 rounded-lg">
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-3xl font-bold text-primary">{clientOrders.length}</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Total Spend</p>
                <p className="text-2xl font-bold">₱{totalSpend.toLocaleString()}</p>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Member Since</span>
                <span className="font-medium">January 2025</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Account Status</span>
                <Badge className="bg-green-100 text-green-800">Active</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link to="/client/invoices">
                <FileText size={16} className="mr-2" />
                View All Invoices
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link to="/client/payments">
                <CreditCard size={16} className="mr-2" />
                Payment History
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Support */}
          <Card>
            <CardHeader>
              <CardTitle>Need Help?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Contact our support team for any questions or concerns.
              </p>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium">Email:</span> support@impex.ph
                </p>
                <p>
                  <span className="font-medium">Phone:</span> +63 2 8123 4567
                </p>
                <p>
                  <span className="font-medium">Hours:</span> Mon-Fri, 8AM-5PM
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isPasswordOpen} onOpenChange={setIsPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Update your account password.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Current Password</Label>
              <Input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => {
                  setPasswordForm({ ...passwordForm, currentPassword: e.target.value });
                  if (passwordErrors.currentPassword) setPasswordErrors((prev) => ({ ...prev, currentPassword: '' }));
                }}
                className="mt-1"
              />
              {passwordErrors.currentPassword && (
                <p className="text-xs text-destructive mt-1">{passwordErrors.currentPassword}</p>
              )}
            </div>
            <div>
              <Label>New Password</Label>
              <Input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => {
                  setPasswordForm({ ...passwordForm, newPassword: e.target.value });
                  if (passwordErrors.newPassword) setPasswordErrors((prev) => ({ ...prev, newPassword: '' }));
                }}
                className="mt-1"
              />
              {passwordErrors.newPassword && (
                <p className="text-xs text-destructive mt-1">{passwordErrors.newPassword}</p>
              )}
            </div>
            <div>
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => {
                  setPasswordForm({ ...passwordForm, confirmPassword: e.target.value });
                  if (passwordErrors.confirmPassword) setPasswordErrors((prev) => ({ ...prev, confirmPassword: '' }));
                }}
                className="mt-1"
              />
              {passwordErrors.confirmPassword && (
                <p className="text-xs text-destructive mt-1">{passwordErrors.confirmPassword}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleChangePassword}>Update Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isVerifyOpen} onOpenChange={setIsVerifyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Email</DialogTitle>
            <DialogDescription>Enter the 6-digit code sent to your email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="verifyCode">Verification Code</Label>
            <Input
              id="verifyCode"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
            />
            <Button
              type="button"
              variant="link"
              className="px-0 text-sm text-primary"
              onClick={handleResendVerifyEmail}
              disabled={isResendingVerify}
            >
              {isResendingVerify ? 'Resending...' : 'Resend code'}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsVerifyOpen(false)}>Cancel</Button>
            <Button onClick={handleVerifyEmail}>Verify</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
