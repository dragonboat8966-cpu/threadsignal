import Dashboard from "./dashboard";
import styles from "./dashboard.module.css";

export const metadata = { title: "商機工作台｜ThreadSignal" };

export default function DashboardPage() {
  return <main className={styles.page}><Dashboard /></main>;
}
