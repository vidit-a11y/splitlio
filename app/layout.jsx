import { Inter } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import Header from "@/components/header";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Splitlio",
  description: "The smartest way to split expenses with friends.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
          <ConvexClientProvider>
            {/* HEADER ALWAYS SHOWN */}
            <Header />

            {/* IMPORTANT: CHILDREN MUST BE HERE */}
            <main className="min-h-screen">
              {children}
            </main>

            <Toaster richColors />
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}