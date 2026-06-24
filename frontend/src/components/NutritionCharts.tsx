'use client';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Bar, Pie } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  ArcElement, Title, Tooltip, Legend, Filler,
  annotationPlugin,
);

interface DailyNutrition {
  day: number;
  label: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// ==================== 1. WEEKLY CALORIES BAR CHART ====================

interface CaloriesBarProps {
  daily: DailyNutrition[];
  calorieTarget?: number;
}

export function WeeklyCaloriesChart({ daily, calorieTarget }: CaloriesBarProps) {
  const data = {
    labels: daily.map((d) => d.label),
    datasets: [
      {
        label: 'Calories (kcal)',
        data: daily.map((d) => d.calories),
        backgroundColor: daily.map((d) =>
          calorieTarget && d.calories > calorieTarget * 1.1
            ? 'rgba(239, 68, 68, 0.7)'   // Red if >110% target
            : calorieTarget && d.calories < calorieTarget * 0.8
            ? 'rgba(251, 191, 36, 0.7)'   // Yellow if <80% target
            : 'rgba(16, 185, 129, 0.7)',   // Green if on target
        ),
        borderColor: daily.map((d) =>
          calorieTarget && d.calories > calorieTarget * 1.1
            ? 'rgb(239, 68, 68)'
            : calorieTarget && d.calories < calorieTarget * 0.8
            ? 'rgb(251, 191, 36)'
            : 'rgb(16, 185, 129)',
        ),
        borderWidth: 2,
        borderRadius: 8,
      },
    ],
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { font: { size: 12 }, usePointStyle: true },
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label}: ${ctx.raw} kcal`,
        },
      },
      annotation: calorieTarget ? {
        annotations: {
          targetLine: {
            type: 'line',
            yMin: calorieTarget,
            yMax: calorieTarget,
            borderColor: 'rgba(99, 102, 241, 0.8)',
            borderWidth: 2,
            borderDash: [6, 4],
            label: {
              display: true,
              content: `Mục tiêu: ${calorieTarget} kcal`,
              position: 'end',
              backgroundColor: 'rgba(99, 102, 241, 0.85)',
              color: '#fff',
              font: { size: 11, weight: 'bold' },
              padding: { top: 3, bottom: 3, left: 6, right: 6 },
              borderRadius: 4,
            },
          },
        },
      } : undefined,
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Calories (kcal)', font: { size: 12 } },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
      x: {
        grid: { display: false },
      },
    },
  };

  return <Bar data={data} options={options} />;
}

// ==================== 2. MACRO PIE CHART ====================

interface MacroPieProps {
  protein: number;
  carbs: number;
  fat: number;
}

export function MacroDistributionChart({ protein, carbs, fat }: MacroPieProps) {
  // Calculate calorie contribution: Protein/Carbs = 4 cal/g, Fat = 9 cal/g
  const proteinCal = protein * 4;
  const carbsCal = carbs * 4;
  const fatCal = fat * 9;
  const total = proteinCal + carbsCal + fatCal;

  const data = {
    labels: [
      `Protein (${Math.round((proteinCal / total) * 100)}%)`,
      `Carbs (${Math.round((carbsCal / total) * 100)}%)`,
      `Fat (${Math.round((fatCal / total) * 100)}%)`,
    ],
    datasets: [{
      data: [proteinCal, carbsCal, fatCal],
      backgroundColor: [
        'rgba(59, 130, 246, 0.8)',   // Blue — Protein
        'rgba(251, 191, 36, 0.8)',   // Yellow — Carbs
        'rgba(239, 68, 68, 0.8)',    // Red — Fat
      ],
      borderColor: [
        'rgb(59, 130, 246)',
        'rgb(251, 191, 36)',
        'rgb(239, 68, 68)',
      ],
      borderWidth: 2,
      hoverOffset: 8,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { font: { size: 12 }, padding: 16, usePointStyle: true },
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const pct = Math.round((ctx.raw / total) * 100);
            return `${ctx.label}: ${ctx.raw} kcal (${pct}%)`;
          },
        },
      },
    },
  };

  return <Pie data={data} options={options} />;
}

// ==================== 3. DAILY MACRO STACKED BAR CHART ====================

interface DailyMacroProps {
  daily: DailyNutrition[];
}

export function DailyMacroChart({ daily }: DailyMacroProps) {
  const data = {
    labels: daily.map((d) => d.label),
    datasets: [
      {
        label: 'Protein (g)',
        data: daily.map((d) => d.protein),
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
        borderRadius: 4,
      },
      {
        label: 'Carbs (g)',
        data: daily.map((d) => d.carbs),
        backgroundColor: 'rgba(251, 191, 36, 0.7)',
        borderRadius: 4,
      },
      {
        label: 'Fat (g)',
        data: daily.map((d) => d.fat),
        backgroundColor: 'rgba(239, 68, 68, 0.7)',
        borderRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { font: { size: 12 }, usePointStyle: true },
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false } },
      y: {
        stacked: true,
        beginAtZero: true,
        title: { display: true, text: 'Grams (g)', font: { size: 12 } },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
    },
  };

  return <Bar data={data} options={options} />;
}

// ==================== 4. SINGLE NUTRIENT BY DAY BAR CHART ====================

interface NutrientByDayProps {
  daily: DailyNutrition[];
  nutrient: 'protein' | 'carbs' | 'fat';
  label: string;
  color: string;
  targetLine?: number;
  targetLabel?: string;
}

export function NutrientByDayChart({ daily, nutrient, label, color, targetLine, targetLabel }: NutrientByDayProps) {
  const data = {
    labels: daily.map((d) => d.label),
    datasets: [
      {
        label,
        data: daily.map((d) => d[nutrient]),
        backgroundColor: color,
        borderColor: color.replace('0.7', '1'),
        borderWidth: 2,
        borderRadius: 8,
      },
    ],
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${label}: ${ctx.raw}g`,
        },
      },
      annotation: targetLine ? {
        annotations: {
          target: {
            type: 'line',
            yMin: targetLine,
            yMax: targetLine,
            borderColor: 'rgba(99, 102, 241, 0.7)',
            borderWidth: 2,
            borderDash: [6, 4],
            label: {
              display: true,
              content: targetLabel || `Mục tiêu: ${targetLine}g`,
              position: 'end',
              backgroundColor: 'rgba(99, 102, 241, 0.85)',
              color: '#fff',
              font: { size: 10, weight: 'bold' },
              padding: { top: 2, bottom: 2, left: 5, right: 5 },
              borderRadius: 4,
            },
          },
        },
      } : undefined,
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Gram (g)', font: { size: 12 } },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
      x: {
        grid: { display: false },
      },
    },
  };

  return <Bar data={data} options={options} />;
}
