import { onlyColumns, CREATOR_PROFILE_COLUMNS } from "../creatorApplication";

export interface LeadMergeDeps {
  supabase: any;
  privilegedSupabase: any;
  getDb: () => any;
  saveDb: (db: any) => void;
  getIsoNow?: () => string;
}

export interface LeadMergeResult {
  merged: boolean;
  leadFound: boolean;
  leadSource?: 'creator_profiles' | 'waitlist' | 'none';
  profile?: any;
  dealsLinked: number;
  threadsLinked: number;
  ugcOrdersLinked: number;
  previousUserId?: string;
}

/**
 * Smart Signup Auto-Merge Service
 * 
 * Automatically detects if a newly registered or logging-in user matches an existing
 * creator lead (from landing page form submissions, waitlist, or pre-seeded creator profiles).
 * 
 * Seamlessly links their profile, Instagram handle, rate card, category, and any deals,
 * chat threads, or UGC orders initiated by brands before the creator signed up.
 */
export function createLeadMergeService({
  supabase,
  privilegedSupabase,
  getDb,
  saveDb,
  getIsoNow = () => new Date().toISOString(),
}: LeadMergeDeps) {
  const dbClient = privilegedSupabase || supabase;

  return async function autoMergeCreatorLead(
    userId: string,
    email: string,
    phone?: string,
    providedRole?: string
  ): Promise<LeadMergeResult> {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const nowIso = getIsoNow();

    if (!cleanEmail && !cleanPhone) {
      return { merged: false, leadFound: false, dealsLinked: 0, threadsLinked: 0, ugcOrdersLinked: 0 };
    }

    console.log(`[SmartAutoMerge] Checking leads for user ${userId} (email: ${cleanEmail}, phone: ${cleanPhone})`);

    const db = getDb();
    let leadProfile: any = null;
    let oldUserId: string | null = null;
    let leadSource: 'creator_profiles' | 'waitlist' | 'none' = 'none';

    // 1. Look for matching profile in Supabase creator_profiles
    if (dbClient && cleanEmail) {
      try {
        const { data: matchedProfiles } = await dbClient
          .from('creator_profiles')
          .select('*')
          .ilike('email', String(cleanEmail).replace(/[\\%_]/g, (m: string) => "\\" + m))
          .limit(5);

        if (matchedProfiles && matchedProfiles.length > 0) {
          // Prefer profile that isn't the target user yet, or is marked unclaimed
          leadProfile = matchedProfiles.find((p: any) => p.user_id !== userId) || matchedProfiles[0];
          leadSource = 'creator_profiles';
          if (leadProfile && leadProfile.user_id !== userId) {
            oldUserId = leadProfile.user_id;
          }
        }
      } catch (e: any) {
        console.warn("[SmartAutoMerge] Supabase creator_profiles query error:", e?.message || e);
      }
    }

    // 1b. Check local DB creator_profiles
    if (!leadProfile && db.creator_profiles) {
      const found = db.creator_profiles.find((p: any) => {
        const pEmail = (p.email || p.contact_email || p.rate_card?.extras?.contact_email || '').toLowerCase();
        if (cleanEmail && pEmail === cleanEmail) return true;
        if (cleanPhone && p.phone) {
          const pPhone = p.phone.replace(/\D/g, '');
          if (pPhone.length >= 10 && cleanPhone.endsWith(pPhone.slice(-10))) return true;
        }
        return false;
      });
      if (found) {
        leadProfile = found;
        leadSource = 'creator_profiles';
        if (leadProfile.user_id !== userId) {
          oldUserId = leadProfile.user_id;
        }
      }
    }

    // 2. If no creator_profile was found, check waitlist for landing page form leads
    let waitlistLead: any = null;
    if (!leadProfile) {
      if (dbClient && cleanEmail) {
        try {
          const { data: wList } = await dbClient
            .from('waitlist')
            .select('*')
            .ilike('email', String(cleanEmail).replace(/[\\%_]/g, (m: string) => "\\" + m))
            .limit(1);
          if (wList && wList.length > 0) {
            waitlistLead = wList[0];
            leadSource = 'waitlist';
          }
        } catch (e: any) {
          console.warn("[SmartAutoMerge] Supabase waitlist query error:", e?.message || e);
        }
      }

      if (!waitlistLead && db.waitlist) {
        const found = db.waitlist.find((w: any) => {
          const wEmail = (w.email || '').toLowerCase();
          return cleanEmail && wEmail === cleanEmail;
        });
        if (found) {
          waitlistLead = found;
          leadSource = 'waitlist';
        }
      }
    }

    // If neither a profile nor a waitlist lead was found, check if there are deals/threads waiting for this email
    let dealsLinkedCount = 0;
    let threadsLinkedCount = 0;
    let ugcOrdersLinkedCount = 0;

    // 3. Process Profile Merge if leadProfile or waitlistLead exists
    let finalProfile: any = null;

    if (leadProfile) {
      console.log(`[SmartAutoMerge] Found existing lead profile ${leadProfile.user_id || 'unassigned'} for ${cleanEmail}`);
      
      // Session 36: the profile keeps its own review state (an admin-approved unclaimed profile is
      // already approved); claiming it does not approve or verify anything new.
      const updatedProfileData = {
        ...leadProfile,
        user_id: userId,
        email: cleanEmail,
        is_claimed: true,
        updated_at: nowIso,
      };

      finalProfile = updatedProfileData;

      // Update in Supabase creator_profiles
      if (dbClient) {
        try {
          // Upsert the profile under the new user_id
          await dbClient
            .from('creator_profiles')
            .upsert(onlyColumns(updatedProfileData, CREATOR_PROFILE_COLUMNS));

          // If oldUserId was different and temporary, delete old placeholder profile row
          if (oldUserId && oldUserId !== userId) {
            await dbClient
              .from('creator_profiles')
              .delete()
              .eq('user_id', oldUserId);
          }
        } catch (e: any) {
          console.warn("[SmartAutoMerge] Supabase creator_profiles update error:", e?.message || e);
        }
      }

      // Update in local memory db
      if (!db.creator_profiles) db.creator_profiles = [];
      const localIdx = db.creator_profiles.findIndex((p: any) => p.user_id === userId || (oldUserId && p.user_id === oldUserId) || (p.email && p.email.toLowerCase() === cleanEmail));
      if (localIdx >= 0) {
        db.creator_profiles[localIdx] = updatedProfileData;
      } else {
        db.creator_profiles.push(updatedProfileData);
      }
    } else if (waitlistLead) {
      // Session 36 (rule 72): an application is NOT a profile. A pending / rejected applicant who signs up
      // goes through normal onboarding and review. We only link the waitlist row to the new account —
      // no profile is created, nothing is approved, no numbers are invented (the old code made a
      // "verified, approved" profile with Mumbai / 10,000 followers / ₹5,000 defaults).
      console.log(`[SmartAutoMerge] Linking waitlist application for ${cleanEmail} to user ${userId} (no profile created)`);
      if (dbClient) {
        try {
          await dbClient.from('waitlist').update({ linked_user_id: userId, is_registered_user: true }).ilike('email', String(cleanEmail).replace(/[\\%_]/g, (m: string) => "\\" + m));
        } catch (e: any) {
          console.warn("[SmartAutoMerge] Waitlist link error in Supabase:", e?.message || e);
        }
      }
      if (db.waitlist) {
        const wIdx = db.waitlist.findIndex((w: any) => (w.email || '').toLowerCase() === cleanEmail);
        if (wIdx >= 0) db.waitlist[wIdx] = { ...db.waitlist[wIdx], linked_user_id: userId, is_registered_user: true };
      }
    }

    // 4. Reassign Deals, UGC Orders, and Chat Threads
    // If oldUserId existed OR if deals/threads have creator_id matching oldUserId or email matching cleanEmail
    const targetOldIds = new Set<string>();
    if (oldUserId && oldUserId !== userId) targetOldIds.add(oldUserId);

    // Also check for any deals or threads explicitly addressed to cleanEmail
    if (db.deals) {
      db.deals.forEach((d: any) => {
        if (d.creator_email && d.creator_email.toLowerCase() === cleanEmail) {
          if (d.creator_id && d.creator_id !== userId) targetOldIds.add(d.creator_id);
          d.creator_id = userId;
          d.to_user_id = userId;
          dealsLinkedCount++;
        } else if (oldUserId && (d.creator_id === oldUserId || d.to_user_id === oldUserId)) {
          d.creator_id = userId;
          d.to_user_id = userId;
          dealsLinkedCount++;
        }
      });
    }

    if (db.chat_threads) {
      db.chat_threads.forEach((t: any) => {
        if (t.creator_email && t.creator_email.toLowerCase() === cleanEmail) {
          if (t.creator_id && t.creator_id !== userId) targetOldIds.add(t.creator_id);
          t.creator_id = userId;
          threadsLinkedCount++;
        } else if (oldUserId && t.creator_id === oldUserId) {
          t.creator_id = userId;
          threadsLinkedCount++;
        }
      });
    }

    if (db.ugc_orders) {
      db.ugc_orders.forEach((o: any) => {
        if (o.creator_email && o.creator_email.toLowerCase() === cleanEmail) {
          if (o.creator_id && o.creator_id !== userId) targetOldIds.add(o.creator_id);
          o.creator_id = userId;
          ugcOrdersLinkedCount++;
        } else if (oldUserId && o.creator_id === oldUserId) {
          o.creator_id = userId;
          ugcOrdersLinkedCount++;
        }
      });
    }

    if (db.brief_requests) {
      db.brief_requests.forEach((b: any) => {
        if (b.creator_email && b.creator_email.toLowerCase() === cleanEmail) {
          if (b.creator_id && b.creator_id !== userId) targetOldIds.add(b.creator_id);
          b.creator_id = userId;
          b.creator_is_claimed = true;
        } else if (oldUserId && b.creator_id === oldUserId) {
          b.creator_id = userId;
          b.creator_is_claimed = true;
        }
      });
    }

    // In Supabase, migrate all records linked to oldUserId
    if (dbClient && targetOldIds.size > 0) {
      for (const tId of targetOldIds) {
        try {
          // Session 36: real column names (deals has no to_user_id; chat_messages uses sender_user_id /
          // receiver_user_id; transactions uses creator_id). Each update runs on its own so one miss
          // does not stop the rest.
          const moves: Array<[string, Record<string, any>, string]> = [
            ['deals', { creator_id: userId }, 'creator_id'],
            ['chat_threads', { creator_id: userId }, 'creator_id'],
            ['chat_messages', { sender_user_id: userId }, 'sender_user_id'],
            ['chat_messages', { receiver_user_id: userId }, 'receiver_user_id'],
            ['ugc_orders', { creator_id: userId }, 'creator_id'],
            ['campaign_applications', { creator_id: userId }, 'creator_id'],
            ['content_submissions', { creator_id: userId }, 'creator_id'],
            ['notifications', { user_id: userId }, 'user_id'],
            ['transactions', { creator_id: userId }, 'creator_id'],
            ['brief_requests', { creator_id: userId, creator_is_claimed: true }, 'creator_id'],
            ['collabs', { to_user_id: userId }, 'to_user_id'],
            ['waves', { to_user_id: userId }, 'to_user_id'],
          ];
          for (const [table, patch, col] of moves) {
            const { error } = await dbClient.from(table).update(patch).eq(col, tId);
            if (error) console.warn(`[SmartAutoMerge] ${table}.${col} move for ${tId}:`, error.message);
          }
          console.log(`[SmartAutoMerge] Successfully migrated records from old ID ${tId} to user ${userId}`);
        } catch (e: any) {
          console.warn(`[SmartAutoMerge] Error migrating records for ${tId}:`, e?.message || e);
        }
      }
    }

    // 5. Update the users table to mark as fully onboarded creator
    if (finalProfile) {
      // users columns only (no onboarding_completed / onboarding_complete / updated_at there)
      const userUpdates: any = {
        role: 'creator',
        onboarded: true,
      };

      if (finalProfile?.name) userUpdates.name = finalProfile.name;
      if (finalProfile?.rate_card?.extras?.phone && !cleanPhone) userUpdates.phone = finalProfile.rate_card.extras.phone;
      if (finalProfile?.picture) userUpdates.picture = finalProfile.picture;

      if (dbClient) {
        try {
          await dbClient.from('users').update(userUpdates).eq('user_id', userId);
        } catch (e: any) {
          console.warn("[SmartAutoMerge] Error updating user onboarded status:", e?.message || e);
        }
      }

      if (db.users) {
        const uIdx = db.users.findIndex((u: any) => u.user_id === userId);
        if (uIdx >= 0) {
          db.users[uIdx] = { ...db.users[uIdx], ...userUpdates };
        }
      }
    }

    saveDb(db);

    console.log(`[SmartAutoMerge] Finished auto-merge for ${cleanEmail}: leadFound=${Boolean(finalProfile)}, dealsLinked=${dealsLinkedCount}, threadsLinked=${threadsLinkedCount}`);

    return {
      merged: Boolean(finalProfile || dealsLinkedCount > 0 || threadsLinkedCount > 0),
      leadFound: Boolean(finalProfile),
      leadSource,
      profile: finalProfile,
      dealsLinked: dealsLinkedCount,
      threadsLinked: threadsLinkedCount,
      ugcOrdersLinked: ugcOrdersLinkedCount,
      previousUserId: oldUserId || undefined,
    };
  };
}
