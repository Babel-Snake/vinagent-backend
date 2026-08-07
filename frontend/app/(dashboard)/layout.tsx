'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '../../lib/firebase';
import { clearPinSession, getMyProfile, getPinSession, saveDefaultWineryContext, type AuthDisplayUser, type UserProfile } from '../../lib/api';
import Navbar from '../../components/Navbar';
import { clientLogger } from '../../lib/clientLogger';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [user, setUser] = useState<AuthDisplayUser | null>(null);
    const [fullProfile, setFullProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
            if (currentUser) {
                clearPinSession();
                setUser(currentUser);

                try {
                    const profileData = await getMyProfile();
                    setFullProfile(profileData.user);
                } catch (e) {
                    clientLogger.error("Failed to load profile", e);
                }

                setLoading(false);
            } else {
                const pinSession = getPinSession();
                if (!pinSession) {
                    setLoading(false);
                    router.push('/login');
                    return;
                }

                setUser({
                    uid: `pin-${pinSession.user.id}`,
                    email: pinSession.user.email ?? null,
                    displayName: pinSession.user.displayName ?? null,
                    isPinSession: true
                });

                try {
                    const profileData = await getMyProfile();
                    setFullProfile(profileData.user);
                    if (profileData.user?.wineryId) {
                        saveDefaultWineryContext({
                            wineryId: profileData.user.wineryId,
                            wineryName: profileData.user.wineryName
                        });
                    }
                } catch (e) {
                    clientLogger.error("Failed to load PIN profile", e);
                    clearPinSession();
                    router.push('/login');
                } finally {
                    setLoading(false);
                }
            }
        });

        return () => unsubscribe();
    }, [router]);

    useEffect(() => {
        if (!fullProfile?.isPinSession) return;

        const pinSession = getPinSession();
        if (!pinSession) return;

        const timeoutMs = Math.max(60, pinSession.idleTimeoutSeconds || 300) * 1000;
        let timer: ReturnType<typeof setTimeout>;

        const lockSession = () => {
            clearPinSession();
            router.push('/login');
        };

        const resetTimer = () => {
            clearTimeout(timer);
            timer = setTimeout(lockSession, timeoutMs);
        };

        const events = ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'];
        events.forEach(eventName => window.addEventListener(eventName, resetTimer, { passive: true }));
        resetTimer();

        return () => {
            clearTimeout(timer);
            events.forEach(eventName => window.removeEventListener(eventName, resetTimer));
        };
    }, [fullProfile?.isPinSession, router]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
                <div className="h-9 w-9 animate-spin rounded-full border-4 border-[#d9dfd2] border-t-[var(--brand)]"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--background)] text-[#1c231f]">
            <Navbar
                user={user}
                fullProfile={fullProfile}
                onProfileUpdated={(updatedProfile) => setFullProfile(updatedProfile)}
            />
            <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
                {children}
            </main>
        </div>
    );
}
