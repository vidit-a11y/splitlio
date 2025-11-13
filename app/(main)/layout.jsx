"use client";

import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/nextjs";

export default function MainLayout({ children }) {
  return (
    <>
      <SignedIn>
        <div className="container mx-auto mt-24 mb-20 px-4">
          {children}
        </div>
      </SignedIn>

      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}