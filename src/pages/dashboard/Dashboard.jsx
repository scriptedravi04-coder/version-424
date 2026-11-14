import React, { Suspense, lazy, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import useIsMobile from "../../hooks/useIsMobile";
import PageSkeleton from "../../components/layout/PageSkeleton";
import { CreatorHomeSkeleton } from "../../components/common/MobileSkeletons";
import { lazyRetry } from "../../lib/staleBuild"; // v398: old page after a deploy → new version, no error screen

// Session 42 (Ravi: "the app is slow"): each dashboard is its own download. A phone only loads its
// mobile home; the desktop dashboards (charts library, guided tour) no longer ride along in the
// first file every phone has to download and read before anything shows.
const CreatorDashboard = lazyRetry(() => import("../../components/dashboard/CreatorDashboard"));
const CreatorHomeMobile = lazyRetry(() => import("../creator/CreatorHomeMobile"));
const BrandDashboard = lazyRetry(() => import("../../components/dashboard/BrandDashboard"));
const BrandHomeMobile = lazyRetry(() => import("../brand/BrandHomeMobile"));
const TourRunner = lazyRetry(() => import("../../components/dashboard/TourRunner"));

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const isAdminOrSubAdmin = user?.role === "admin" || user?.team_role === "sub_admin";

  useEffect(() => {
    if (isAdminOrSubAdmin) {
      navigate("/admin", { replace: true });
    }
  }, [isAdminOrSubAdmin, navigate]);

  if (isAdminOrSubAdmin) return null;

  const isCreator = user?.role === "creator";

  if (isCreator && isMobile) {
    return <Suspense fallback={<CreatorHomeSkeleton />}><CreatorHomeMobile user={user} /></Suspense>;
  }

  if (!isCreator && isMobile) {
    return <Suspense fallback={<CreatorHomeSkeleton />}><BrandHomeMobile user={user} /></Suspense>;
  }

  return (
    <Suspense fallback={<PageSkeleton />}>
      {user && <TourRunner user={user} />}
      {isCreator ? <CreatorDashboard user={user} /> : <BrandDashboard user={user} />}
    </Suspense>
  );
}
