import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import csv
import unittest
from trust_score.trust_score_engine import FinancialData, TrustScoreEngine

ENGINE = TrustScoreEngine()
PAYMENTS = [
    ('4 on time', 4, 0, 0, 100, 82),
    ('3 on time + 1 late', 3, 1, 0, 87.5, 77),
    ('2 on time + 2 late', 2, 2, 0, 75, 72),
    ('2 on time + 1 late + 1 missed', 2, 1, 1, 62.5, 67),
    ('1 on time + 1 late + 2 missed', 1, 1, 2, 37.5, 57),
    ('4 missed', 0, 0, 4, 0, 42),
]


def score_component(result, name):
    return next(c.score for c in result.components if c.name == name)


def payment_rows():
    """
    Fixed $1000 income, $750 Transport spending, components 70
    """
    output = []
    for name, ontime, late, missed, expected_p, expected_trust in PAYMENTS:
        result = ENGINE.calculate_score(FinancialData(
            monthly_income=1000, monthly_spending=750,
            adjusted_monthly_spending=675, total_purchases_count=1,
            total_bills=4, bills_paid_on_time=ontime,
            bills_paid_late=late, bills_missed=missed,
        ))
        output.append({
            'scenario': name,
            'payment': score_component(result, 'Payment Consistency'),
            'spending': score_component(result, 'Spending Discipline'),
            'savings': score_component(result, 'Savings Behaviour'),
            'trust_score': result.total_score,
            'expected_payment': expected_p,
            'expected_trust': expected_trust,
        })
    return output


def spending_rows():
    result = []
    for ratio in range(0, 121):
        score = ENGINE.calculate_score(FinancialData(
            monthly_income=1000, monthly_spending=ratio*10,
            adjusted_monthly_spending=ratio*10,
            total_purchases_count=1, payment_not_applicable=True,
        ))
        result.append({'spending_ratio': ratio,
                       'spending_score': score_component(score, 'Spending Discipline'),
                       'savings_score': score_component(score, 'Savings Behaviour')})
    return result


class ScoringSensitivityTests(unittest.TestCase):
    def test_six_payment_scenarios_match_report(self):
        for row in payment_rows():
            with self.subTest(row['scenario']):
                self.assertEqual(row['payment'], row['expected_payment'])
                self.assertEqual(row['spending'], 70)
                self.assertEqual(row['savings'], 70)
                self.assertEqual(row['trust_score'], row['expected_trust'])

    def test_spending_components_decrease_in_steps(self):
        items = spending_rows()
        for before, after in zip(items, items[1:]):
            self.assertLessEqual(after['spending_score'], before['spending_score'])
            self.assertLessEqual(after['savings_score'], before['savings_score'])
        self.assertTrue(any(a['spending_score'] == b['spending_score'] for a,b in zip(items,items[1:])))

    def test_weight_of_payment_40_percent(self):
        rows = payment_rows()
        self.assertEqual(rows[0]['trust_score'] - rows[-1]['trust_score'], 40)


def export_figures(output_folder):
    """Output CSVs and Figure 34/35/36 PNGs from engine calculations."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    output_folder = Path(output_folder)
    output_folder.mkdir(parents=True, exist_ok=True)
    payments = payment_rows()
    spending = spending_rows()
    for filename, rows in [('payment_sensitivity.csv', payments),('spending_sensitivity.csv',spending)]:
        with (output_folder / filename).open('w',newline='',encoding='utf-8') as f:
            w=csv.DictWriter(f, fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    for number, key, title in [(34,'payment','Payment Consistency by Payment Outcome'),(35,'trust_score','Overall Trust Score by Payment Outcome')]:
        fig,ax=plt.subplots(figsize=(11,5.3))
        ax.plot(range(len(payments)),[r[key] for r in payments], marker='o')
        ax.set_xticks(range(len(payments)))
        ax.set_xticklabels([r['scenario'] for r in payments], rotation=25, ha='right')
        ax.set_ylabel('Score (0–100)');ax.set_ylim(0,110);ax.set_title(title)
        ax.grid(axis='y',alpha=.25);fig.tight_layout()
        fig.savefig(output_folder / f'figure_{number}.png',dpi=145);plt.close(fig)
    fig,ax=plt.subplots(figsize=(9,5))
    ax.step([r['spending_ratio'] for r in spending],[r['spending_score'] for r in spending],label='Spending Discipline',where='post')
    ax.step([r['spending_ratio'] for r in spending],[r['savings_score'] for r in spending],label='Savings Behaviour',where='post')
    ax.set_xlabel('Spending as a percentage of income');ax.set_ylabel('Component score')
    ax.set_title('Spending and Savings Sensitivity');ax.set_xlim(0,120);ax.set_ylim(0,110)
    ax.legend();ax.grid(axis='y',alpha=.25);fig.tight_layout()
    fig.savefig(output_folder/'figure_36.png',dpi=145);plt.close(fig)


if __name__ == '__main__':
    output = ROOT / 'evaluation' / 'results'
    export_figures(output)
    payments = payment_rows()
    assert len(payments) == 6
    assert all(r['payment'] == r['expected_payment'] and r['trust_score'] == r['expected_trust'] for r in payments)
    assert all(r['spending'] == 70 and r['savings'] == 70 for r in payments)
    print('Payment scenarios: 6/6 matched expected scores')
    print('Spending ratios evaluated: 0%–120%')
    print('Saved Figures 34–36 and CSV data to:', output)
