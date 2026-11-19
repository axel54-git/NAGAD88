import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Settings as SettingsIcon,
  ImagePlus,
  Save,
  MessageSquare,
  LogOut,
  LoaderCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from '../components/Avatar';
import { updateUserProfile } from '../lib/store';
import { uploadProofImage } from '../lib/uploadImage';
import { openTelegramChat, triggerHaptic } from '../lib/telegram';

export function Settings() {
  const { user, config, logout } = useAuth();
  const navigate = useNavigate();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [photoUrl, setPhotoUrl] = useState(user?.photoUrl ?? "");
  const [uploading, setUploading] = useState(false);

  if (!user) return null;

  const handlePhotoUpload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    triggerHaptic("light");
    try {
      const url = await uploadProofImage(file, config.imgbbApiKey);
      setPhotoUrl(url);
      toast.success("প্রোফাইল ছবি আপলোড হয়েছে!");
    } catch {
      toast.error("ছবি আপলোড ব্যর্থ হয়েছে।");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = () => {
    updateUserProfile(user.telegramId, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      bio: bio.trim(),
      photoUrl
    });
    triggerHaptic("success");
    toast.success("প্রোফাইল তথ্য সফলভাবে সেভ হয়েছে!");
    navigate("/profile");
  };

  return (
    <main className="px-3 pt-3 pb-8">
      {/* Header */}
      <header className="mb-3 flex items-center gap-2">
        <button
          onClick={() => navigate("/profile")}
          aria-label="Back"
          className="luxury-btn-dark flex h-8 w-8 items-center justify-center rounded-xl active:scale-95 transition cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4 text-amber-300" />
        </button>
        <span className="luxury-btn-dark flex h-8 w-8 items-center justify-center rounded-xl">
          <SettingsIcon className="h-4 w-4 text-amber-300" />
        </span>
        <h1 className="text-[15px] font-extrabold text-[#fff7eb] drop-shadow-xs">Settings</h1>
      </header>

      {/* Edit Profile Form */}
      <section className="luxury-card rounded-2xl p-3">
        <div className="flex items-center gap-3">
          <Avatar src={photoUrl} name={firstName} size={56} ring="ring-amber-400/40" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="luxury-btn-dark flex h-8 items-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold transition active:scale-95 cursor-pointer"
          >
            {uploading ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-amber-300" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5 text-amber-300" />
            )}
            Change Photo
          </button>
        </div>

        <div className="mt-3 space-y-2.5">
          <InputField label="First Name" value={firstName} onChange={setFirstName} />
          <InputField label="Last Name" value={lastName} onChange={setLastName} />
          <InputField label="Bio" value={bio} onChange={setBio} placeholder="Tell something about you" />
        </div>

        <button
          onClick={handleSave}
          className="luxury-btn-gold mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-extrabold transition active:scale-98 cursor-pointer"
        >
          <Save className="h-4 w-4" /> Save changes
        </button>
      </section>

      {/* Account Details & Danger */}
      <h2 className="mt-4 text-[15px] font-extrabold text-[#fff7eb] drop-shadow-xs">Account Settings</h2>
      <section className="mt-2 space-y-2">
        <ReadOnlyField label="Telegram ID" value={user.telegramId} />
        <ReadOnlyField label="Username" value={user.username ? `@${user.username}` : "Not set"} />
        <ReadOnlyField label="Binance ID" value={user.binanceId || "Not set"} />

        <button
          onClick={() => openTelegramChat(config.supportUrl)}
          className="luxury-card flex h-11 w-full items-center gap-2.5 rounded-2xl px-3 text-[12px] font-semibold text-[#fff7eb] transition hover:border-amber-400/40 active:scale-98 cursor-pointer"
        >
          <MessageSquare className="h-4 w-4 text-amber-300" /> Telegram Support Group
        </button>

        <button
          onClick={() => {
            if (confirm("Are you sure you want to log out?")) {
              logout();
            }
          }}
          className="luxury-card flex h-11 w-full items-center gap-2.5 rounded-2xl px-3 text-[12px] font-semibold text-rose-400 transition hover:border-rose-400/40 active:scale-98 cursor-pointer"
        >
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </section>
    </main>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder = ""
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-amber-100/65">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="luxury-subcard mt-0.5 h-9 w-full rounded-xl px-3 text-[12px] text-[#fff7eb] placeholder-amber-100/35 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30"
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="luxury-card flex items-center justify-between rounded-2xl px-3 py-2.5">
      <span className="text-[11px] text-amber-100/60">{label}</span>
      <span className="text-[12px] font-bold text-[#fff7eb] font-mono">{value}</span>
    </div>
  );
}
