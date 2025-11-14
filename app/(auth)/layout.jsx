"use client";

export default function AuthLayout({ children }) {
  return (
    <div className="flex items-center justify-center min-h-screen w-full bg-white">
      {children}
    </div>
  );
}