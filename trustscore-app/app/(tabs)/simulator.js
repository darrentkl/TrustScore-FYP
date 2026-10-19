// Simulator screen

import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";

import { COLORS, FONTS, SPACING, RADIUS, COMMON } from "../../constants/theme";
import { getSimulationSetup, runSimulation } from "../../services/api";
import { useSimulator } from "../../contexts/SimulatorContext";

const SPENDING_STEP = 50;
const MAX_TEMPORARY_BILLS = 5;

const SPENDING_CATEGORIES = [
  "Food & Drinks",
  "Transport",
  "Shopping",
  "Entertainment",
  "Gaming",
  "Fitness",
  "Other",
];

function emptyCategorySpending() {
  return Object.fromEntries(SPENDING_CATEGORIES.map((category) => [category, 0]));
}

function normalizeCategorySpending(values = {}) {
  return Object.fromEntries(
    SPENDING_CATEGORIES.map((category) => [
      category,
      Math.max(0, Math.round(Number(values?.[category] || 0))),
    ])
  );
}

const BILL_STATUS_OPTIONS = [
  {
    label: "Paid on time",
    value: "paid_on_time",
    color: COLORS.accent,
  },
  {
    label: "Paid late",
    value: "late",
    color: COLORS.warning,
  },
  {
    label: "Missed",
    value: "missed",
    color: COLORS.danger,
  },
];

export default function SimulatorScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const {
  simulatorDraft,
  setSimulatorDraft,
  clearSimulatorDraft,
} = useSimulator();
  const latestRequestId = useRef(0);
  const temporaryBillId = useRef(0);

  const [setup, setSetup] = useState(null);
  const [simResult, setSimResult] = useState(null);

  // Current-month non-bill spending, simulated independently by category.
  const [categorySpending, setCategorySpending] = useState(
    emptyCategorySpending()
  );

  const [draftDirty, setDraftDirty] = useState(false);

  // Real Tracker bills temporarily changed in the Simulator.
  const [simulatedBills, setSimulatedBills] = useState([]);

  // Temporary simulated bills 
  const [temporaryBills, setTemporaryBills] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ready, setReady] = useState(false);
  const [impactExpanded, setImpactExpanded] = useState(false);

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused]);

  useEffect(() => {
    if (!ready || !setup?.available || !draftDirty) return;

    setSimulatorDraft({
      categorySpending,
      simulatedBills,
      temporaryBills,
      hasTrackedBills: setup.has_tracked_bills,
      hasTrackedExpenses: setup.has_tracked_expenses,
    });
  }, [
    categorySpending,
    simulatedBills,
    temporaryBills,
    draftDirty,
    ready,
    setup,
    setSimulatorDraft,
  ]);

  useEffect(() => {
    if (!ready || !setup?.available) return;

    const temporaryScenarioStarted = temporaryBills.length > 0;
    const temporaryScenarioComplete = isTemporaryScenarioComplete();

    // Wait until every temporary bill has both an amount and a status.
    if (temporaryScenarioStarted && !temporaryScenarioComplete) {
      latestRequestId.current += 1;
      return;
    }

    const initialCategorySpending = normalizeCategorySpending(
      setup.current_category_spending
    );

    const categorySpendingHasChanged = SPENDING_CATEGORIES.some(
      (category) =>
        Number(categorySpending[category] || 0) !==
        Number(initialCategorySpending[category] || 0)
    );

    const trackedBillHasChanged = setup.has_tracked_bills
      ? simulatedBills.some((bill) => bill.status !== bill.current_status)
      : false;

    const temporaryBillHasChanged = temporaryScenarioComplete;

    const hasSimulationChange =
      categorySpendingHasChanged ||
      trackedBillHasChanged ||
      temporaryBillHasChanged;

    if (!hasSimulationChange) {
      latestRequestId.current += 1;
      setSimResult(null);
      setImpactExpanded(false);
      return;
    }

    const timer = setTimeout(() => {
      calculateSimulation();
    }, 250);

    return () => clearTimeout(timer);
  }, [
    categorySpending,
    simulatedBills,
    temporaryBills,
    ready,
    setup,
  ]);

  async function loadData() {
    try {
      latestRequestId.current += 1;
      setLoading(true);
      setReady(false);
      setSimResult(null);
      setImpactExpanded(false);

      const setupData = await getSimulationSetup();
      setSetup(setupData);

      if (!setupData.available) {
        return;
      }

      const initialCategorySpending = normalizeCategorySpending(
        setupData.current_category_spending
      );

      // Restore the current Simulator session only if it belongs to the same baseline shape.
      const canRestoreDraft =
        simulatorDraft &&
        simulatorDraft.categorySpending &&
        simulatorDraft.hasTrackedBills === setupData.has_tracked_bills &&
        simulatorDraft.hasTrackedExpenses === setupData.has_tracked_expenses;

      if (canRestoreDraft) {
        setCategorySpending(
          normalizeCategorySpending(simulatorDraft.categorySpending)
        );

        if (setupData.has_tracked_bills) {
          const restoredBills = (setupData.tracked_bills || []).map((bill) => {
            const savedBill = (simulatorDraft.simulatedBills || []).find(
              (saved) => saved.id === bill.id
            );

            return {
              id: bill.id,
              name: bill.name,
              amount: Number(bill.amount),
              due_date: bill.due_date,
              current_status: bill.status,
              status: savedBill?.status ?? bill.status,
            };
          });

          setSimulatedBills(restoredBills);
        } else {
          setSimulatedBills([]);
        }

        const restoredTemporaryBills = simulatorDraft.temporaryBills || [];
        setTemporaryBills(restoredTemporaryBills);

        const highestTemporaryId = restoredTemporaryBills.reduce(
          (highest, bill) => {
            const number = Number(
              String(bill.id).replace("temporary-", "")
            );
            return Number.isFinite(number)
              ? Math.max(highest, number)
              : highest;
          },
          0
        );

        temporaryBillId.current = highestTemporaryId;
        setDraftDirty(true);
        setReady(true);
        return;
      }

      setCategorySpending(initialCategorySpending);

      if (setupData.has_tracked_bills) {
        setSimulatedBills(
          (setupData.tracked_bills || []).map((bill) => ({
            id: bill.id,
            name: bill.name,
            amount: Number(bill.amount),
            due_date: bill.due_date,
            current_status: bill.status,
            status: bill.status,
          }))
        );
      } else {
        setSimulatedBills([]);
      }

      setTemporaryBills([]);
      setReady(true);
    } catch (error) {
      console.error("Failed to load simulator setup:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }
  async function calculateSimulation() {
    const requestId = ++latestRequestId.current;

    try {
      const hasCompleteTemporaryBills =
        temporaryBills.length > 0 && isTemporaryScenarioComplete();

      const payload = {
        category_spending: categorySpending,

        ...(setup.has_tracked_bills
          ? {
              simulated_bills: simulatedBills.map((bill) => ({
                bill_id: bill.id,
                status: bill.status,
              })),
            }
          : {}),

        ...(hasCompleteTemporaryBills
          ? {
              temporary_bills: temporaryBills.map((bill) => ({
                amount: Number(bill.amount),
                status: bill.status,
              })),
            }
          : {}),
      };

      const result = await runSimulation(payload);

      if (requestId === latestRequestId.current) {
        setSimResult(result);
      }
    } catch (error) {
      console.error("Simulation failed:", error);
    }
  }

  function getInitialCategorySpending() {
    return normalizeCategorySpending(setup?.current_category_spending);
  }

  function getCategorySpendingTotal(values = categorySpending) {
    return SPENDING_CATEGORIES.reduce(
      (total, category) => total + Number(values?.[category] || 0),
      0
    );
  }

  function formatMoney(value) {
    return `$${Math.round(Number(value || 0)).toLocaleString()}`;
  }

  function formatBillDueDate(dateString) {
    if (!dateString) return "";

    const [year, month, day] = dateString.split("-").map(Number);

    const monthName = new Date(year, month - 1, day).toLocaleString("en-SG", {
      month: "short",
    });

    return `${day} ${monthName}`;
  }

  function getResultColor(change) {
    if (change > 0) return COLORS.accent;
    if (change < 0) return COLORS.danger;
    return COLORS.textDim;
  }

  function getBillStatusLabel(status) {
    switch (status) {
      case "paid_on_time":
        return "Paid on time";
      case "late":
        return "Paid late";
      case "missed":
        return "Missed";
      default:
        return "Upcoming";
    }
  }

  function getBillStatusColor(status) {
    switch (status) {
      case "paid_on_time":
        return COLORS.accent;
      case "late":
        return COLORS.warning;
      case "missed":
        return COLORS.danger;
      default:
        return COLORS.blue;
    }
  }

  function isValidTemporaryBillAmount(value) {
    const amount = Number(value);

    return Number.isFinite(amount) && amount > 0;
  }

  function calculatePaidBillSpending(bills) {
    return bills
      .filter(
        (bill) => bill.status === "paid_on_time" || bill.status === "late"
      )
      .reduce((total, bill) => total + Number(bill.amount || 0), 0);
  }

  function calculateTemporaryPaidBillSpending(bills) {
    return bills.reduce((total, bill) => {
      if (!isValidTemporaryBillAmount(bill.amount)) {
        return total;
      }

      if (bill.status === "paid_on_time" || bill.status === "late") {
        return total + Number(bill.amount);
      }

      return total;
    }, 0);
  }

  function temporaryBillsHaveCompleteInputs() {
    return (
      temporaryBills.length > 0 &&
      temporaryBills.every(
        (bill) =>
          isValidTemporaryBillAmount(bill.amount) &&
          bill.status !== null
      )
    );
  }

  function isTemporaryScenarioComplete() {
    return temporaryBillsHaveCompleteInputs();
  }

  function handleCategoryAmountInput(category, value) {
    setDraftDirty(true);

    const digitsOnly = String(value ?? "").replace(/[^0-9]/g, "");
    const requestedAmount = digitsOnly === "" ? 0 : Number(digitsOnly);

    setCategorySpending((current) => {
      const nextAmount = Number.isFinite(requestedAmount)
        ? Math.max(0, Math.round(requestedAmount))
        : 0;

      return {
        ...current,
        [category]: nextAmount,
      };
    });
  }

  function handleDecreaseCategory(category) {
    setDraftDirty(true);

    setCategorySpending((current) => ({
      ...current,
      [category]: Math.max(
        0,
        Number(current?.[category] || 0) - SPENDING_STEP
      ),
    }));
  }

  function handleIncreaseCategory(category) {
    setDraftDirty(true);

    setCategorySpending((current) => ({
      ...current,
      [category]: Number(current?.[category] || 0) + SPENDING_STEP,
    }));
  }
  function handleBillStatusChange(billId, newStatus) {
    setDraftDirty(true);

    const updatedBills = simulatedBills.map((bill) =>
      bill.id === billId ? { ...bill, status: newStatus } : bill
    );

    setSimulatedBills(updatedBills);

  }

  function handleAddTemporaryBill() {
    if (temporaryBills.length >= MAX_TEMPORARY_BILLS) return;

    setDraftDirty(true);

    temporaryBillId.current += 1;

    setTemporaryBills((current) => [
      ...current,
      {
        id: `temporary-${temporaryBillId.current}`,
        amount: "",
        status: null,
      },
    ]);
  }

  function handleTemporaryBillAmountChange(billId, value) {
    setDraftDirty(true);

    const updatedBills = temporaryBills.map((bill) =>
      bill.id === billId ? { ...bill, amount: value } : bill
    );

    setTemporaryBills(updatedBills);
  }

  function handleTemporaryBillStatusChange(billId, status) {
    setDraftDirty(true);

    const updatedBills = temporaryBills.map((bill) =>
      bill.id === billId ? { ...bill, status } : bill
    );

    setTemporaryBills(updatedBills);
  }

  function handleRemoveTemporaryBill(billId) {
    setDraftDirty(true);
    setTemporaryBills((current) =>
      current.filter((bill) => bill.id !== billId)
    );
  }
  function handleReset() {
    latestRequestId.current += 1;
    setDraftDirty(false);
    clearSimulatorDraft();
    temporaryBillId.current = 0;
    setSimResult(null);
    setImpactExpanded(false);
    setTemporaryBills([]);
    setCategorySpending(getInitialCategorySpending());

    if (setup.has_tracked_bills) {
      setSimulatedBills(
        (setup.tracked_bills || []).map((bill) => ({
          id: bill.id,
          name: bill.name,
          amount: Number(bill.amount),
          due_date: bill.due_date,
          current_status: bill.status,
          status: bill.status,
        }))
      );
    } else {
      setSimulatedBills([]);
    }
  }

  if (loading) {
    return (
      <View style={[COMMON.screen, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (!setup?.available) {
    return (
      <ScrollView
        style={COMMON.screen}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
            tintColor={COLORS.accent}
          />
        }
      >
        <Text style={styles.title}>Simulator</Text>

        <Text style={styles.subtitle}>
          See how different financial habits this month affect your score
        </Text>

        <View style={styles.lockedCard}>
          <Text style={styles.lockedTitle}>Simulator unavailable</Text>

          <Text style={styles.lockedText}>
            {setup?.message || "Add your monthly income to begin."}
          </Text>

          <TouchableOpacity
            style={[COMMON.button, COMMON.buttonPrimary, styles.settingsButton]}
            onPress={() => router.push("/settings")}
          >
            <Text style={COMMON.buttonText}>Go to Settings</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const hasTrackedBills = setup.has_tracked_bills;
  const hasTemporaryBills = temporaryBills.length > 0;

  const trackedPaidBillSpending = hasTrackedBills
    ? calculatePaidBillSpending(simulatedBills)
    : 0;

  const temporaryPaidBillSpending = hasTemporaryBills
    ? calculateTemporaryPaidBillSpending(temporaryBills)
    : 0;

  const simulatedPaidBillSpending =
    trackedPaidBillSpending + temporaryPaidBillSpending;

  const simulatedNonBillSpending = getCategorySpendingTotal();
  const totalSimulatedSpending =
    simulatedNonBillSpending + simulatedPaidBillSpending;

  const simulatedBalance = setup.monthly_income - totalSimulatedSpending;
  const simulatedEstimatedSavings = Math.max(0, simulatedBalance);
  const simulatedOverspentBy = Math.max(0, -simulatedBalance);
  const isOverspending = simulatedOverspentBy > 0;

  const displayedBills = [
    ...(hasTrackedBills ? simulatedBills : []),
    ...temporaryBills,
  ];

  const simulatedOnTimePayments = displayedBills.filter(
    (bill) => bill.status === "paid_on_time"
  ).length;

  const simulatedLatePayments = displayedBills.filter(
    (bill) => bill.status === "late"
  ).length;

  const simulatedMissedPayments = displayedBills.filter(
    (bill) => bill.status === "missed"
  ).length;

  const scoreChange = simResult?.score_change ?? 0;
  const simulatedScore = simResult?.simulated_score ?? null;
  const simulatedGrade = simResult?.simulated_grade ?? "";

  return (
    <ScrollView
      style={COMMON.screen}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadData();
          }}
          tintColor={COLORS.accent}
        />
      }
    >
      <Text style={styles.title}>Simulator</Text>

      <Text style={styles.subtitle}>
        See how different financial habits this month affect your score.
      </Text>

      {/* Score Result */}
      <View style={styles.scoreCard}>
        <View style={styles.scoreSummaryRow}>
          {!simResult ? (
            <View style={styles.singleScoreBox}>
              <Text style={styles.scoreBoxLabel}>CURRENT SCORE</Text>
              <Text style={styles.scoreBoxValue}>{setup.current_score}</Text>
              <Text style={styles.scoreBoxGrade}>{setup.current_grade}</Text>
            </View>
          ) : (
            <>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreBoxLabel}>CURRENT</Text>
                <Text style={styles.scoreBoxValue}>{setup.current_score}</Text>
                <Text style={styles.scoreBoxGrade}>{setup.current_grade}</Text>
              </View>

              <View style={styles.arrowContainer}>
                <Text style={styles.arrow}>→</Text>

                <View
                  style={[
                    styles.changeBadge,
                    {
                      backgroundColor:
                        scoreChange > 0
                          ? COLORS.accentDim
                          : scoreChange < 0
                          ? COLORS.dangerDim
                          : COLORS.surfaceLight,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.changeText,
                      { color: getResultColor(scoreChange) },
                    ]}
                  >
                    {scoreChange > 0 ? "+" : ""}
                    {scoreChange}
                  </Text>
                </View>
              </View>

              <View style={styles.scoreBox}>
                <Text style={styles.scoreBoxLabel}>SIMULATED</Text>

                <Text
                  style={[
                    styles.scoreBoxValue,
                    { color: getResultColor(scoreChange) },
                  ]}
                >
                  {simulatedScore}
                </Text>

                <Text
                  style={[
                    styles.scoreBoxGrade,
                    { color: getResultColor(scoreChange) },
                  ]}
                >
                  {simulatedGrade}
                </Text>
              </View>
            </>
          )}
        </View>

        {simResult && (
          <>
            <View style={styles.impactDivider} />

            <TouchableOpacity
              style={styles.impactToggle}
              onPress={() => setImpactExpanded((current) => !current)}
            >
              <Text style={styles.impactToggleText}>
                View Component Impact
              </Text>

              <Text style={styles.impactToggleSymbol}>
                {impactExpanded ? "−" : "+"}
              </Text>
            </TouchableOpacity>

            {impactExpanded && (
              <View style={styles.impactDetails}>
                {simResult.component_changes.map((change, index) => (
                  <View key={index} style={styles.changeRow}>
                    <Text style={styles.changeName}>{change.name}</Text>

                    <View style={styles.changeValues}>
                      <Text style={styles.changeFrom}>
                        {change.current}/100
                      </Text>

                      <Text style={styles.changeArrow}>→</Text>

                      <Text
                        style={[
                          styles.changeTo,
                          { color: getResultColor(change.change) },
                        ]}
                      >
                        {change.simulated}/100
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>

      {/* Scenario Spending */}
      <View style={styles.controlCard}>
        <Text style={styles.controlTitle}>Spending by category</Text>

        <Text style={styles.currentText}>
          Adjust each non-bill category for this month. 
        </Text>

        {SPENDING_CATEGORIES.map((category) => {
          const amount = Number(categorySpending[category] || 0);
          const multiplier = Number(
            setup.category_multipliers?.[category] ?? 1
          );
          const cannotDecrease = amount <= 0;

          return (
            <View key={category} style={styles.categorySimulatorRow}>
              <View style={styles.categorySimulatorHeader}>
                <View style={styles.categoryNameRow}>
                  <Text style={styles.billScenarioName}>{category}</Text>
                  <Text style={styles.categoryMultiplier}>
                    ×{multiplier.toFixed(2)}
                  </Text>
                </View>
              </View>

              <View style={styles.categoryAmountControlRow}>
                <TouchableOpacity
                  style={[
                    styles.adjustButton,
                    cannotDecrease && styles.adjustButtonDisabled,
                  ]}
                  onPress={() => handleDecreaseCategory(category)}
                  disabled={cannotDecrease}
                >
                  <Text
                    style={[
                      styles.adjustButtonText,
                      cannotDecrease && styles.adjustButtonTextDisabled,
                    ]}
                  >
                    −
                  </Text>
                </TouchableOpacity>

                <View style={styles.categoryAmountInputWrapper}>
                  <Text style={styles.categoryCurrencySymbol}>$</Text>
                  <TextInput
                    style={styles.categoryAmountInput}
                    value={String(Math.round(amount))}
                    onChangeText={(value) =>
                      handleCategoryAmountInput(category, value)
                    }
                    keyboardType="number-pad"
                    selectTextOnFocus
                    maxLength={8}
                  />
                </View>

                <TouchableOpacity
                  style={styles.adjustButton}
                  onPress={() => handleIncreaseCategory(category)}
                >
                  <Text style={styles.adjustButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <View style={styles.cardDivider} />

        <View style={styles.totalLine}>
          <Text style={styles.totalLineLabel}>Total non-bill spending</Text>
          <Text style={styles.totalLineValue}>
            {formatMoney(simulatedNonBillSpending)}
          </Text>
        </View>

      </View>
      {/* Bill Payments */}
      <View style={styles.controlCard}>
        <Text style={styles.controlTitle}>Bill Payments</Text>

        {hasTrackedBills ? (
          <>
            <Text style={styles.currentText}>
              Simulate different payment outcomes for your tracked bills this month.
            </Text>

            <View style={styles.paymentSummary}>
              <View style={styles.paymentItem}>
                <Text style={styles.paymentNumber}>
                  {simulatedOnTimePayments}
                </Text>
                <Text style={styles.paymentLabel}>On time</Text>
              </View>

              <View style={styles.paymentItem}>
                <Text style={styles.paymentNumber}>
                  {simulatedLatePayments}
                </Text>
                <Text style={styles.paymentLabel}>Late</Text>
              </View>

              <View style={styles.paymentItem}>
                <Text style={styles.paymentNumber}>
                  {simulatedMissedPayments}
                </Text>
                <Text style={styles.paymentLabel}>Missed</Text>
              </View>
            </View>

            {simulatedBills.map((bill) => {
              const currentColor = getBillStatusColor(bill.current_status);

              return (
                <View key={bill.id} style={styles.billScenarioCard}>
                  <View style={styles.billScenarioHeader}>
                    <View style={styles.billScenarioInfo}>
                      <Text style={styles.billScenarioName}>{bill.name}</Text>

                      <Text style={styles.billScenarioMeta}>
                        {formatMoney(bill.amount)} · Due{" "}
                        {formatBillDueDate(bill.due_date)}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.currentStatusBadge,
                        { backgroundColor: currentColor + "22" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.currentStatusText,
                          { color: currentColor },
                        ]}
                      >
                        {getBillStatusLabel(bill.current_status)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.simulateAsLabel}>Simulate as</Text>

                  <View style={styles.statusOptions}>
                    {BILL_STATUS_OPTIONS.map((option) => {
                      const isSelected = bill.status === option.value;

                      return (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.statusChip,
                            isSelected && {
                              backgroundColor: option.color + "22",
                              borderColor: option.color,
                            },
                          ]}
                          onPress={() =>
                            handleBillStatusChange(bill.id, option.value)
                          }
                        >
                          <Text
                            style={[
                              styles.statusChipText,
                              isSelected && {
                                color: option.color,
                                fontWeight: "600",
                              },
                            ]}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
            <Text style={styles.extraBillsTitle}>Simulate Extra Bills</Text>

            <Text style={styles.currentText}>
              Add up to 5 temporary bills to test what would happen if you had more bills this month.
            </Text>

            {temporaryBills.map((bill, index) => {
              const amountError =
                bill.amount !== "" && !isValidTemporaryBillAmount(bill.amount);

              return (
                <View key={bill.id} style={styles.billScenarioCard}>
                  <View style={styles.temporaryBillHeader}>
                    <Text style={styles.billScenarioName}>
                      Simulated Bill {index + 1}
                    </Text>

                    <TouchableOpacity onPress={() => handleRemoveTemporaryBill(bill.id)}>
                      <Text style={styles.removeTemporaryBillText}>Remove</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.temporaryInputLabel}>Amount ($)</Text>

                  <TextInput
                    style={COMMON.textInput}
                    placeholder="e.g. 30"
                    placeholderTextColor={COLORS.textMuted}
                    value={bill.amount}
                    onChangeText={(value) =>
                      handleTemporaryBillAmountChange(bill.id, value)
                    }
                    keyboardType="decimal-pad"
                  />

                  {amountError && (
                    <Text style={styles.fieldError}>
                      Enter an amount greater than $0.
                    </Text>
                  )}

                  <Text style={styles.simulateAsLabel}>Simulate as</Text>

                  <View style={styles.statusOptions}>
                    {BILL_STATUS_OPTIONS.map((option) => {
                      const isSelected = bill.status === option.value;

                      return (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.statusChip,
                            isSelected && {
                              backgroundColor: option.color + "22",
                              borderColor: option.color,
                            },
                          ]}
                          onPress={() =>
                            handleTemporaryBillStatusChange(bill.id, option.value)
                          }
                        >
                          <Text
                            style={[
                              styles.statusChipText,
                              isSelected && {
                                color: option.color,
                                fontWeight: "600",
                              },
                            ]}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            {temporaryBills.length < MAX_TEMPORARY_BILLS && (
              <TouchableOpacity
                style={styles.addTemporaryBillButton}
                onPress={handleAddTemporaryBill}
              >
                <Text style={styles.addTemporaryBillText}>+ Add Simulated Bill</Text>
              </TouchableOpacity>
            )}

            {temporaryBills.length > 0 && (
              <Text style={styles.temporaryBillNote}>
                Temporary bills are used only for this simulation and will not be added to your Tracker.
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={styles.currentText}>
              Add temporary bills to explore how different payment outcomes affect your simulated score.
            </Text>

            {hasTemporaryBills && temporaryBillsHaveCompleteInputs() && (
              <View style={styles.paymentSummary}>
                <View style={styles.paymentItem}>
                  <Text style={styles.paymentNumber}>
                    {simulatedOnTimePayments}
                  </Text>
                  <Text style={styles.paymentLabel}>On time</Text>
                </View>

                <View style={styles.paymentItem}>
                  <Text style={styles.paymentNumber}>
                    {simulatedLatePayments}
                  </Text>
                  <Text style={styles.paymentLabel}>Late</Text>
                </View>

                <View style={styles.paymentItem}>
                  <Text style={styles.paymentNumber}>
                    {simulatedMissedPayments}
                  </Text>
                  <Text style={styles.paymentLabel}>Missed</Text>
                </View>
              </View>
            )}

            {temporaryBills.map((bill, index) => {
              const amountError =
                bill.amount !== "" &&
                !isValidTemporaryBillAmount(bill.amount);

              return (
                <View key={bill.id} style={styles.billScenarioCard}>
                  <View style={styles.temporaryBillHeader}>
                    <Text style={styles.billScenarioName}>
                      Simulated Bill {index + 1}
                    </Text>

                    <TouchableOpacity
                      onPress={() => handleRemoveTemporaryBill(bill.id)}
                    >
                      <Text style={styles.removeTemporaryBillText}>
                        Remove
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.temporaryInputLabel}>Amount ($)</Text>

                  <TextInput
                    style={COMMON.textInput}
                    placeholder="e.g. 30"
                    placeholderTextColor={COLORS.textMuted}
                    value={bill.amount}
                    onChangeText={(value) =>
                      handleTemporaryBillAmountChange(bill.id, value)
                    }
                    keyboardType="decimal-pad"
                  />

                  {amountError && (
                    <Text style={styles.fieldError}>
                      Enter an amount greater than $0.
                    </Text>
                  )}

                  <Text style={styles.simulateAsLabel}>Simulate as</Text>

                  <View style={styles.statusOptions}>
                    {BILL_STATUS_OPTIONS.map((option) => {
                      const isSelected = bill.status === option.value;

                      return (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.statusChip,
                            isSelected && {
                              backgroundColor: option.color + "22",
                              borderColor: option.color,
                            },
                          ]}
                          onPress={() =>
                            handleTemporaryBillStatusChange(
                              bill.id,
                              option.value
                            )
                          }
                        >
                          <Text
                            style={[
                              styles.statusChipText,
                              isSelected && {
                                color: option.color,
                                fontWeight: "600",
                              },
                            ]}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            {temporaryBills.length < MAX_TEMPORARY_BILLS && (
              <TouchableOpacity
                style={styles.addTemporaryBillButton}
                onPress={handleAddTemporaryBill}
              >
                <Text style={styles.addTemporaryBillText}>
                  + Add Simulated Bill
                </Text>
              </TouchableOpacity>
            )}

            {temporaryBills.length > 0 && (
              <Text style={styles.temporaryBillNote}>
                Temporary bills are used only for this simulation and will not be added to your Tracker.
              </Text>
            )}
          </>
        )}
      </View>

      {/* Summary */}
      <View style={styles.controlCard}>
        <Text style={styles.controlTitle}>Summary</Text>

        <View style={styles.summaryContent}>
          <View style={styles.summaryLine}>
            <Text style={styles.summaryLineLabel}>
              Spending (excluding bills)
            </Text>
            <Text style={styles.summaryLineValue}>
              {formatMoney(simulatedNonBillSpending)}
            </Text>
          </View>

          <View style={styles.summaryLine}>
            <Text style={styles.summaryLineLabel}>Paid bills</Text>
            <Text style={styles.summaryLineValue}>
              {formatMoney(simulatedPaidBillSpending)}
            </Text>
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.totalLine}>
            <Text style={styles.totalLineLabel}>
              Total simulated spending
            </Text>
            <Text style={styles.totalLineValue}>
            {formatMoney(totalSimulatedSpending)}
            </Text>
          </View>

          <View style={styles.summaryLine}>
            <Text style={styles.summaryLineLabel}>
              {isOverspending ? "Overspent by" : "Estimated savings"}
            </Text>

            <Text
              style={[
                styles.summaryLineValue,
                isOverspending && styles.overspentValue,
              ]}
            >
              {isOverspending
                ? formatMoney(simulatedOverspentBy)
                : formatMoney(simulatedEstimatedSavings)}
            </Text>
          </View>
        </View>
      </View>

      {/* Reset */}
      <TouchableOpacity
        style={[COMMON.button, COMMON.buttonPrimary, styles.resetButton]}
        onPress={handleReset}
      >
        <Text style={COMMON.buttonText}>Reset</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.xl,
    paddingTop: SPACING.xxl + 20,
    paddingBottom: 100,
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    fontSize: FONTS.xl,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },

  subtitle: {
    fontSize: FONTS.sm,
    color: COLORS.textDim,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },

  scoreCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.base,
  },

  scoreSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },

  scoreBox: {
    flex: 1,
    alignItems: "center",
  },

  singleScoreBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SPACING.sm,
  },

  scoreBoxLabel: {
    fontSize: FONTS.xs,
    fontWeight: "600",
    color: COLORS.textDim,
    letterSpacing: 1,
    marginBottom: SPACING.xs,
  },

  scoreBoxValue: {
    fontSize: FONTS.title,
    fontWeight: "800",
    color: COLORS.text,
  },

  scoreBoxGrade: {
    fontSize: FONTS.xs,
    fontWeight: "600",
    color: COLORS.textDim,
    textTransform: "uppercase",
    marginTop: 2,
  },

  arrowContainer: {
    alignItems: "center",
    gap: SPACING.xs,
  },

  arrow: {
    fontSize: FONTS.xl,
    color: COLORS.textMuted,
  },

  changeBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },

  changeText: {
    fontSize: FONTS.sm,
    fontWeight: "700",
  },

  impactDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: SPACING.base,
  },

  impactToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: SPACING.md,
  },

  impactToggleText: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.text,
  },

  impactToggleSymbol: {
    fontSize: FONTS.lg,
    fontWeight: "500",
    color: COLORS.textDim,
  },

  impactDetails: {
    marginTop: SPACING.sm,
  },

  changeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.sm,
  },

  changeName: {
    flex: 1,
    fontSize: FONTS.sm,
    color: COLORS.text,
  },

  changeValues: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },

  changeFrom: {
    fontSize: FONTS.xs,
    color: COLORS.textDim,
  },

  changeArrow: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
  },

  changeTo: {
    fontSize: FONTS.xs,
    fontWeight: "600",
  },

  controlCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.base,
  },

  controlHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: SPACING.sm,
  },

  controlTitle: {
    flex: 1,
    fontSize: FONTS.md,
    fontWeight: "600",
    color: COLORS.text,
  },

  currentText: {
    fontSize: FONTS.xs,
    color: COLORS.textDim,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
    lineHeight: 18,
  },

  categoryAmountControlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },

  categoryAmountInputWrapper: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
  },

  categoryCurrencySymbol: {
    fontSize: FONTS.md,
    fontWeight: "600",
    color: COLORS.textDim,
    marginRight: SPACING.xs,
  },

  categoryAmountInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: SPACING.sm,
    fontSize: FONTS.md,
    fontWeight: "700",
    color: COLORS.accent,
    textAlign: "center",
  },

  adjustButton: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },

  adjustButtonDisabled: {
    opacity: 0.4,
  },

  adjustButtonText: {
    fontSize: 22,
    fontWeight: "500",
    color: COLORS.text,
    lineHeight: 24,
  },

  adjustButtonTextDisabled: {
    color: COLORS.textMuted,
  },

  categorySimulatorRow: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  categorySimulatorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },

  categoryNameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: SPACING.xs,
  },

  categoryMultiplier: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
  },

  summaryContent: {
    marginTop: SPACING.xs,
  },

  summaryLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xs,
    gap: SPACING.sm,
  },

  summaryLineLabel: {
    flex: 1,
    fontSize: FONTS.sm,
    color: COLORS.textDim,
  },

  summaryLineValue: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.text,
    textAlign: "right",
  },

  cardDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },

  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xs,
    gap: SPACING.sm,
  },

  totalLineLabel: {
    flex: 1,
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.textDim,
  },

  totalLineValue: {
    fontSize: FONTS.sm,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "right",
  },

  paymentSummary: {
    flexDirection: "row",
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },

  paymentItem: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    alignItems: "center",
  },

  paymentNumber: {
    fontSize: FONTS.lg,
    fontWeight: "700",
    color: COLORS.text,
  },

  paymentLabel: {
    fontSize: FONTS.xs,
    color: COLORS.textDim,
    marginTop: 2,
    textAlign: "center",
  },

  billScenarioCard: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  billScenarioHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },

  billScenarioInfo: {
    flex: 1,
  },

  billScenarioName: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.text,
  },

  billScenarioMeta: {
    fontSize: FONTS.xs,
    color: COLORS.textDim,
    marginTop: SPACING.xs,
  },

  currentStatusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },

  currentStatusText: {
    fontSize: FONTS.xs,
    fontWeight: "600",
  },

  simulateAsLabel: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    fontWeight: "500",
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },

  statusOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
  },

  statusChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  statusChipText: {
    fontSize: FONTS.xs,
    color: COLORS.textDim,
  },

  addTemporaryBillButton: {
    marginTop: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.accent + "66",
    paddingVertical: SPACING.sm,
    alignItems: "center",
  },

  addTemporaryBillText: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.accent,
  },

  temporaryBillHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
  },

  removeTemporaryBillText: {
    fontSize: FONTS.xs,
    color: COLORS.danger,
    fontWeight: "500",
  },

  extraBillsTitle: {
  fontSize: FONTS.sm,
  fontWeight: "700",
  color: COLORS.text,
  marginTop: SPACING.md,
  },

  temporaryInputLabel: {
    fontSize: FONTS.xs,
    fontWeight: "600",
    color: COLORS.textDim,
    marginBottom: SPACING.xs,
  },

  fieldError: {
    fontSize: FONTS.xs,
    color: COLORS.danger,
    lineHeight: 18,
    marginTop: SPACING.sm,
  },

  temporaryBillNote: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginTop: SPACING.md,
  },

  resetButton: {
    marginBottom: SPACING.base,
  },

  lockedCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: SPACING.md,
  },

  lockedTitle: {
    fontSize: FONTS.lg,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },

  lockedText: {
    fontSize: FONTS.sm,
    color: COLORS.textDim,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },

  overspentValue: {
    color: COLORS.danger,
  },

  settingsButton: {
    marginTop: SPACING.lg,
  },
});