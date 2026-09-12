import { ReaderPage } from "./page";

export default function ReaderLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <ReaderPage />
      {children}
    </>
  );
}
