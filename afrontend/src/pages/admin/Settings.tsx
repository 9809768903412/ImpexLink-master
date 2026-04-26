import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Building, Users, Bell, Shield, Save, Plus, Trash2, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { useResource } from '@/hooks/use-resource';
import type { User as UserType } from '@/types';
import { apiClient } from '@/api/client';
import { resendVerification } from '@/api/auth';
import { cn } from '@/lib/utils';
import {
  ROLE_LABELS,
  canManageUsers,
  canViewCompanySettings,
} from '@/lib/roles';

// TODO: Replace with real data
export default function SettingsPage() {
  const { user, updateUser, refreshUser } = useAuth();
  const roleList = user?.roles?.length ? user.roles : user?.role ? [user.role] : [];
  const roleOptions = [
    { value: 'president', label: 'President' },
    { value: 'admin', label: 'Admin' },
    { value: 'project_manager', label: 'Project Manager' },
    { value: 'sales_agent', label: 'Sales Agent' },
    { value: 'engineer', label: 'Engineer' },
    { value: 'paint_chemist', label: 'Paint Chemist' },
    { value: 'warehouse_staff', label: 'Warehouse Staff' },
    { value: 'delivery_guy', label: 'Delivery Guy' },
    { value: 'client', label: 'Client' },
  ];
  const [userView, setUserView] = useState<'active' | 'archived'>('active');
  const { data: users, setData: setUsers, reload: reloadUsers } = useResource<UserType[]>(
    '/users',
    [],
    [userView],
    15_000,
    {
      includeDeactivated: userView === 'archived' ? 'true' : 'false',
      onlyDeleted: userView === 'archived' ? 'true' : 'false',
    }
  );
  const { data: companyInfo, reload: reloadCompany } = useResource('/company', {
    name: 'Impex Engineering and Industrial Supply',
    address: '6959 Washington St., Pio Del Pilar, Makati City',
    tin: '100-191-563-00000',
    phone: '+63 2 8123 4567',
    email: 'sales@impex.ph',
    website: 'www.impex.ph',
  });
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    avatarUrl: user?.avatarUrl || '',
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  const [company, setCompany] = useState({
    name: companyInfo.name,
    address: companyInfo.address,
    tin: companyInfo.tin,
    phone: companyInfo.phone,
    email: companyInfo.email,
    website: companyInfo.website,
  });

  const [notifications, setNotifications] = useState({
    lowStock: true,
    orderUpdates: true,
    deliveryAlerts: true,
    paymentAlerts: true,
    aiInsights: false,
    emailDigest: true,
    twoFactorEnabled: true,
  });
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [newUserErrors, setNewUserErrors] = useState<Record<string, string>>({});
  const [isResendingVerify, setIsResendingVerify] = useState(false);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: string; name: string } | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const baseUrl = import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
    : '';
  const pendingClients = users.filter((u) => u.role === 'client' && String(u.status).toLowerCase() !== 'active');
  const normalizedUserSearch = userSearch.trim().toLowerCase();
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !normalizedUserSearch ||
      u.name?.toLowerCase().includes(normalizedUserSearch) ||
      u.email?.toLowerCase().includes(normalizedUserSearch);
    const matchesRole = userRoleFilter === 'all' || u.role === userRoleFilter;
    const statusValue = String(u.status || 'ACTIVE').toLowerCase();
    const matchesStatus = userStatusFilter === 'all' || statusValue === userStatusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'project_manager',
    status: 'ACTIVE',
    companyName: '',
    phone: '',
  });

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
    setCompany({
      name: companyInfo.name,
      address: companyInfo.address,
      tin: companyInfo.tin,
      phone: companyInfo.phone,
      email: companyInfo.email,
      website: companyInfo.website,
    });
    try {
      localStorage.setItem('company_info', JSON.stringify(companyInfo));
    } catch {
      // ignore
    }
  }, [companyInfo]);

  useEffect(() => {
    if (!user) return;
    setProfileData((prev) => ({
      ...prev,
      name: user.name || prev.name,
      email: user.email || prev.email,
      phone: user.phone || prev.phone,
      avatarUrl: user.avatarUrl || prev.avatarUrl,
    }));
  }, [user]);

  const handleSaveProfile = () => {
    const errors: Record<string, string> = {};
    if (!profileData.name.trim()) errors.name = 'Full name is required.';
    if (profileData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileData.email)) {
      errors.email = 'Enter a valid email address.';
    }
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
        const updated = res.data;
        updateUser({
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          avatarUrl: updated.avatarUrl,
          avatar: initials || user?.avatar,
        });
        reloadUsers();
        refreshUser();
        if (res.data?.requiresVerification) {
          toast({
            title: 'Email verification required',
            description: res.data.emailSent === false
              ? 'Email delivery failed. Use the verification code shown below.'
              : 'Check your email for a verification code.',
          });
          if (res.data?.devOtp) {
            toast({
              title: 'Verification code (dev)',
              description: `Code: ${res.data.devOtp}`,
            });
          }
          setIsVerifyOpen(true);
        }
      })
      .catch((err) => {
        toast({
          title: 'Update failed',
          description: err?.response?.data?.error || 'Unable to save your profile. Please try again.',
          variant: 'destructive',
        });
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
          // keep optimistic state
        });
      toast({
        title: 'Photo Updated',
        description: 'Your profile photo has been updated.',
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCompany = () => {
    apiClient
      .put('/company', company)
      .then((res) => {
        reloadCompany();
        try {
          localStorage.setItem('company_info', JSON.stringify(res.data));
        } catch {
          // ignore
        }
      })
      .catch(() => {
        // keep optimistic state
      });
    toast({
      title: 'Company Info Updated',
      description: 'Company information has been saved',
    });
  };

  const handleSaveNotifications = () => {
    apiClient
      .put('/users/me/notifications', notifications)
      .catch(() => {
        // keep optimistic state
      });
    toast({
      title: 'Preferences Saved',
      description: 'Notification preferences updated',
    });
  };

  const handleChangePassword = () => {
    const errors: Record<string, string> = {};
    if (!passwordForm.currentPassword) errors.currentPassword = 'Current password is required.';
    if (!passwordForm.newPassword || passwordForm.newPassword.length < 6) {
      errors.newPassword = 'New password must be at least 6 characters.';
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
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

  const handleCreateUser = () => {
    const errors: Record<string, string> = {};
    if (!newUser.name.trim()) errors.name = 'Full name is required.';
    if (!newUser.email.trim()) errors.email = 'Email is required.';
    if (newUser.email && !newUser.email.includes('@')) errors.email = 'Enter a valid email.';
    if (!newUser.password) errors.password = 'Password is required.';
    if (newUser.password && newUser.password.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }
    if (newUser.role === 'client' && !newUser.companyName?.trim()) {
      errors.companyName = 'Company name is required for clients.';
    }
    setNewUserErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: 'Missing or invalid fields',
        description: 'Please review the highlighted fields.',
        variant: 'destructive',
      });
      return;
    }
    apiClient
      .post('/users', newUser)
      .then((res) => {
        setUsers([res.data, ...users]);
        setIsAddUserOpen(false);
        setNewUser({
          name: '',
          email: '',
          password: '',
          role: 'project_manager',
          status: 'ACTIVE',
          companyName: '',
          phone: '',
        });
        setNewUserErrors({});
      })
      .catch(() => {
        toast({
          title: 'Failed to add user',
          description: 'Please try again.',
          variant: 'destructive',
        });
      });
  };

  const handleUpdateUser = (userId: string, updates: Partial<UserType> & { status?: string }) => {
    apiClient
      .put(`/users/${userId}`, updates)
      .then((res) => {
        setUsers(users.map((u) => (u.id === userId ? { ...u, ...res.data } : u)));
      })
      .catch(() => {
        toast({
          title: 'Failed to update user',
          description: 'Please try again.',
          variant: 'destructive',
        });
      });
  };

  const handleDeleteUser = (userId: string) => {
    apiClient
      .delete(`/users/${userId}`)
      .then(() => {
        reloadUsers();
        toast({
          title: 'User archived',
          description: 'Account has been archived and login access revoked.',
        });
      })
      .catch(() => {
        toast({
          title: 'Failed to delete user',
          description: 'Please try again.',
          variant: 'destructive',
        });
      });
  };

  const handleRestoreUser = (userId: string) => {
    apiClient
      .put(`/users/${userId}/restore`)
      .then(() => {
        reloadUsers();
        toast({
          title: 'User restored',
          description: 'Account has been reactivated.',
        });
      })
      .catch(() => {
        toast({
          title: 'Restore failed',
          description: 'Please try again.',
          variant: 'destructive',
        });
      });
  };

  const handlePromoteToPm = (userId: string) => {
    apiClient
      .post(`/users/${userId}/roles`, { role: 'project_manager' })
      .then((res) => {
        setUsers(users.map((u) => (u.id === userId ? { ...u, ...res.data } : u)));
        toast({
          title: 'Promoted to PM',
          description: 'User can now be assigned to projects.',
        });
      })
      .catch(() => {
        toast({
          title: 'Promotion failed',
          description: 'Please try again.',
          variant: 'destructive',
        });
      });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Settings</h2>
        <p className="text-muted-foreground">Manage your account and system preferences</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList
          className={cn(
            'grid w-full max-w-lg',
            (() => {
              const visibleCount =
                1 +
                (canViewCompanySettings(roleList) ? 1 : 0) +
                (canManageUsers(roleList) ? 1 : 0) +
                1;
              return visibleCount >= 4 ? 'grid-cols-4' : visibleCount === 3 ? 'grid-cols-3' : 'grid-cols-2';
            })()
          )}
        >
          <TabsTrigger value="profile">
            <User size={16} className="mr-2 hidden sm:block" />
            Profile
          </TabsTrigger>
          {canViewCompanySettings(roleList) && (
            <TabsTrigger value="company">
              <Building size={16} className="mr-2 hidden sm:block" />
              Company
            </TabsTrigger>
          )}
          {canManageUsers(roleList) && (
            <TabsTrigger value="users">
              <Users size={16} className="mr-2 hidden sm:block" />
              Users
            </TabsTrigger>
          )}
          <TabsTrigger value="notifications">
            <Bell size={16} className="mr-2 hidden sm:block" />
            Alerts
          </TabsTrigger>
        </TabsList>

        {/* Profile Settings */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Settings</CardTitle>
              <CardDescription>Manage your personal information</CardDescription>
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
                      const next = { ...profileData, name: e.target.value };
                      setProfileData(next);
                      if (profileErrors.name) {
                        setProfileErrors((prev) => ({ ...prev, name: '' }));
                      }
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
                      const next = { ...profileData, email: e.target.value };
                      setProfileData(next);
                      if (profileErrors.email) {
                        setProfileErrors((prev) => ({ ...prev, email: '' }));
                      }
                    }}
                    className="mt-1"
                  />
                  {profileErrors.email && <p className="text-xs text-destructive mt-1">{profileErrors.email}</p>}
                </div>
                <div>
                  <Label>Roles</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {roleList.length ? (
                      roleList.map((role) => (
                        <Badge key={role} variant="secondary" className="text-xs">
                          {ROLE_LABELS[role]}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">No role assigned</span>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={profileData.phone}
                    onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Role</Label>
                  <Input value={user?.role || ''} disabled className="mt-1 capitalize" />
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

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield size={20} />
                Security
              </CardTitle>
              <CardDescription>Manage your account security</CardDescription>
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
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="font-medium">Two-Factor Authentication</p>
                  <p className="text-sm text-muted-foreground">Add extra security to your account</p>
                </div>
                <Switch
                  checked={notifications.twoFactorEnabled}
                  onCheckedChange={(v) => {
                    setNotifications((prev) => ({ ...prev, twoFactorEnabled: v }));
                    apiClient.put('/users/me/notifications', { ...notifications, twoFactorEnabled: v }).catch(() => {
                      // keep optimistic state
                    });
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Company Settings */}
        {canViewCompanySettings(roleList) && (
          <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>
                This information appears on invoices, delivery receipts, and purchase orders
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Company Name</Label>
                <Input
                  value={company.name}
                  onChange={(e) => setCompany({ ...company, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Address</Label>
                <Input
                  value={company.address}
                  onChange={(e) => setCompany({ ...company, address: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>TIN</Label>
                  <Input
                    value={company.tin}
                    onChange={(e) => setCompany({ ...company, tin: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={company.phone}
                    onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={company.email}
                    onChange={(e) => setCompany({ ...company, email: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Website</Label>
                  <Input
                    value={company.website}
                    onChange={(e) => setCompany({ ...company, website: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={handleSaveCompany}>
                  <Save size={16} className="mr-2" />
                  Save Company Info
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {/* User Management (Admin only) */}
        {canManageUsers(roleList) && (
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>Manage system users and permissions</CardDescription>
                  </div>
                  <Button onClick={() => setIsAddUserOpen(true)}>
                    <Plus size={16} className="mr-2" />
                    Add User
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {pendingClients.length > 0 && (
                  <div className="border-b p-4 bg-muted/40">
                    <p className="text-sm font-medium mb-2">Pending Client Approvals</p>
                    <div className="space-y-2">
                      {pendingClients.map((u) => (
                        <div key={u.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{u.name}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {u.proofDocUrl && (
                              <Button variant="outline" size="sm" asChild>
                                <a href={`${baseUrl}${u.proofDocUrl}`} target="_blank" rel="noreferrer">
                                  View Proof
                                </a>
                              </Button>
                            )}
                            <Button size="sm" onClick={() => handleUpdateUser(u.id, { status: 'ACTIVE' })}>
                              Approve
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="border-b p-4">
                  <Tabs value={userView} onValueChange={(v) => setUserView(v as 'active' | 'archived')}>
                    <TabsList>
                      <TabsTrigger value="active">Active Users</TabsTrigger>
                      <TabsTrigger value="archived">Archived Users</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="p-4 border-b">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search users..."
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                        <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                          <SelectTrigger className="w-full lg:w-[200px]">
                            <SelectValue placeholder="All Roles" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Roles</SelectItem>
                            {roleOptions.map((role) => (
                              <SelectItem key={role.value} value={role.value}>
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={userStatusFilter} onValueChange={setUserStatusFilter}>
                          <SelectTrigger className="w-full lg:w-[180px]">
                            <SelectValue placeholder="All Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No users found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((u) => {
                        const roleList = u.roles?.length ? u.roles : u.role ? [u.role] : [];
                        const isPm = roleList.includes('project_manager');
                        const promoteBlocked = roleList.some((role) =>
                          ['admin', 'president', 'delivery_guy', 'client'].includes(role)
                        );
                        return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {(u.name || 'U')
                                  .split(' ')
                                  .map((part) => part[0])
                                  .join('')
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{u.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          <Select
                            value={u.role}
                            onValueChange={(value) => handleUpdateUser(u.id, { role: value })}
                          >
                            <SelectTrigger className="w-[190px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions.map((role) => (
                                <SelectItem key={role.value} value={role.value}>
                                  {role.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={(u.status || 'ACTIVE').toString().toLowerCase()}
                            onValueChange={(value) => handleUpdateUser(u.id, { status: value.toUpperCase() })}
                          >
                            <SelectTrigger className="w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                              <SelectItem value="suspended">Suspended</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          {userView === 'archived' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRestoreUser(u.id)}
                            >
                              Restore
                            </Button>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              {!isPm && !promoteBlocked && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handlePromoteToPm(u.id)}
                                >
                                  Promote to PM
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => setConfirmDeactivate({ id: u.id, name: u.name })}
                              >
                                <Trash2 size={16} className="mr-1" />
                                Archive
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                      );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Notification Settings */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose what alerts you want to receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Low Stock Alerts</p>
                    <p className="text-sm text-muted-foreground">
                      Get notified when items fall below minimum stock
                    </p>
                  </div>
                  <Switch
                    checked={notifications.lowStock}
                    onCheckedChange={(v) => setNotifications({ ...notifications, lowStock: v })}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Order Updates</p>
                    <p className="text-sm text-muted-foreground">
                      New orders and status changes
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
                      Delivery dispatch and confirmations
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
                    <p className="font-medium">Payment Alerts</p>
                    <p className="text-sm text-muted-foreground">
                      Cheque verifications and payment confirmations
                    </p>
                  </div>
                  <Switch
                    checked={notifications.paymentAlerts}
                    onCheckedChange={(v) => setNotifications({ ...notifications, paymentAlerts: v })}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">AI Insights</p>
                    <p className="text-sm text-muted-foreground">
                      Smart recommendations and predictions
                    </p>
                  </div>
                  <Switch
                    checked={notifications.aiInsights}
                    onCheckedChange={(v) => setNotifications({ ...notifications, aiInsights: v })}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Daily Email Digest</p>
                    <p className="text-sm text-muted-foreground">
                      Summary of activities sent to your email
                    </p>
                  </div>
                  <Switch
                    checked={notifications.emailDigest}
                    onCheckedChange={(v) => setNotifications({ ...notifications, emailDigest: v })}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={handleSaveNotifications}>
                  <Save size={16} className="mr-2" />
                  Save Preferences
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
      <Dialog open={!!confirmDeactivate} onOpenChange={() => setConfirmDeactivate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Access</DialogTitle>
            <DialogDescription>
              This will archive <strong>{confirmDeactivate?.name}</strong> and temporarily disable login access.
              Use this when a user is inactive, on hold, or no longer part of the team.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeactivate(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!confirmDeactivate) return;
                handleDeleteUser(confirmDeactivate.id);
                setConfirmDeactivate(null);
              }}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>Create a new user account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input
                value={newUser.name}
                onChange={(e) => {
                  setNewUser({ ...newUser, name: e.target.value });
                  if (newUserErrors.name) {
                    setNewUserErrors((prev) => ({ ...prev, name: '' }));
                  }
                }}
                className="mt-1"
              />
              {newUserErrors.name && <p className="text-xs text-destructive mt-1">{newUserErrors.name}</p>}
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) => {
                  setNewUser({ ...newUser, email: e.target.value });
                  if (newUserErrors.email) {
                    setNewUserErrors((prev) => ({ ...prev, email: '' }));
                  }
                }}
                className="mt-1"
              />
              {newUserErrors.email && <p className="text-xs text-destructive mt-1">{newUserErrors.email}</p>}
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) => {
                  setNewUser({ ...newUser, password: e.target.value });
                  if (newUserErrors.password) {
                    setNewUserErrors((prev) => ({ ...prev, password: '' }));
                  }
                }}
                className="mt-1"
              />
              {newUserErrors.password && <p className="text-xs text-destructive mt-1">{newUserErrors.password}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Role</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(value) => setNewUser({ ...newUser, role: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={newUser.status.toLowerCase()}
                  onValueChange={(value) => setNewUser({ ...newUser, status: value.toUpperCase() })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {newUser.role === 'client' && (
              <div>
                <Label>Company Name</Label>
                <Input
                  value={newUser.companyName}
                  onChange={(e) => {
                    setNewUser({ ...newUser, companyName: e.target.value });
                    if (newUserErrors.companyName) {
                      setNewUserErrors((prev) => ({ ...prev, companyName: '' }));
                    }
                  }}
                  className="mt-1"
                />
                {newUserErrors.companyName && (
                  <p className="text-xs text-destructive mt-1">{newUserErrors.companyName}</p>
                )}
              </div>
            )}
            <div>
              <Label>Phone</Label>
              <Input
                value={newUser.phone}
                onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddUserOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser}>
              Save User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  if (passwordErrors.currentPassword) {
                    setPasswordErrors((prev) => ({ ...prev, currentPassword: '' }));
                  }
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
                  if (passwordErrors.newPassword) {
                    setPasswordErrors((prev) => ({ ...prev, newPassword: '' }));
                  }
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
                  if (passwordErrors.confirmPassword) {
                    setPasswordErrors((prev) => ({ ...prev, confirmPassword: '' }));
                  }
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
    </div>
  );
}
