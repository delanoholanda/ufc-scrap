"use client";

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarTrigger,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { BookOpenCheck, History, Home, LogOut, Settings, User, Users, Database } from "lucide-react";
import Link from "next/link";
import SettingsDialog from "./settings-dialog";
import { usePathname } from "next/navigation";
import { Button } from "./ui/button";

interface MainLayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
  userId: number;
}

export default function MainLayout({ children, onLogout, userId }: MainLayoutProps) {
  const pathname = usePathname();
  
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-muted/40">
        <Sidebar>
          <SidebarContent>
             <SidebarHeader>
                <div className="flex items-center gap-2">
                    <BookOpenCheck className="h-6 w-6 text-primary" />
                    <h1 className="text-lg font-semibold whitespace-nowrap">UFC Data Scraper</h1>
                </div>
            </SidebarHeader>

            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Início" isActive={pathname === '/'}>
                        <Link href="/">
                            <Home />
                            <span>Início</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Histórico" isActive={pathname.startsWith('/history')}>
                        <Link href="/history">
                            <History />
                            <span>Histórico</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Gerenciar Usuários" isActive={pathname.startsWith('/users')}>
                        <Link href="/users">
                            <Users />
                            <span>Gerenciar Usuários</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Matrículas PG" isActive={pathname.startsWith('/matriculas')}>
                        <Link href="/matriculas">
                            <Database />
                            <span>Matrículas PG</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="LDAP" isActive={pathname.startsWith('/ldap')}>
                        <Link href="/ldap/alunos">
                            <Users />
                            <span>LDAP</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
                 <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Meu Perfil" isActive={pathname === '/profile'}>
                        <Link href="/profile">
                            <User />
                            <span>Meu Perfil</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SettingsDialog>
                         <SidebarMenuButton tooltip="Configurações">
                            <Settings />
                            <span>Configurações</span>
                        </SidebarMenuButton>
                    </SettingsDialog>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                    <SidebarMenuButton onClick={onLogout} tooltip="Sair">
                        <LogOut />
                        <span>Sair</span>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1">
             <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6 md:hidden">
                <SidebarTrigger>
                    <BookOpenCheck />
                    <span className="sr-only">Toggle Menu</span>
                </SidebarTrigger>
                <h1 className="font-semibold text-lg">UFC Data Scraper</h1>
             </header>
            {children}
        </div>
      </div>
    </SidebarProvider>
  );
}
