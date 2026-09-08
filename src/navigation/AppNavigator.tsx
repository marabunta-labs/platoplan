/**
 * PlatoPlan - Main app navigator with bottom tabs and nested stacks
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type {
  MainTabParamList,
  RecipeStackParamList,
  PantryStackParamList,
  PlanningStackParamList,
  ShoppingStackParamList,
} from './types';

import { PantryScreen } from '../screens/pantry/PantryScreen';
import { SuggestedRecipesScreen } from '../screens/pantry/SuggestedRecipesScreen';

// --- NUEVAS IMPORTACIONES DE COMPRAS ---
import { ShoppingListScreen } from '../screens/shopping/ShoppingListScreen';
import { ShoppingHubScreen } from '../screens/shopping/ShoppingHubScreen';
import { CustomListBuilderScreen } from '../screens/shopping/CustomListBuilderScreen';

import {
  RecipeListScreen,
  RecipeDetailScreen,
  RecipeFormScreen,
} from '../screens/recipes';

import {
  PlanConfigScreen,
  PlanHistoryScreen,
  RecipeSelectionScreen,
  PlanCalendarScreen,
} from '../screens/planning';

// --- Wrapper screens ---

function PantryListScreen() {
  return <PantryScreen />;
}

// --- Stack navigators ---

const RecipeStack = createNativeStackNavigator<RecipeStackParamList>();

function RecipeStackNavigator() {
  return (
    <RecipeStack.Navigator screenOptions={{ headerShown: false }}>
      <RecipeStack.Screen name="RecipeList" component={RecipeListScreen} />
      <RecipeStack.Screen name="RecipeDetail" component={RecipeDetailScreen} />
      <RecipeStack.Screen name="RecipeForm" component={RecipeFormScreen} />
    </RecipeStack.Navigator>
  );
}

const PantryStack = createNativeStackNavigator<PantryStackParamList>();

function PantryStackNavigator() {
  return (
    <PantryStack.Navigator screenOptions={{ headerShown: false }}>
      <PantryStack.Screen name="PantryList" component={PantryListScreen} />
      <PantryStack.Screen name="SuggestedRecipes" component={SuggestedRecipesScreen} />
    </PantryStack.Navigator>
  );
}

const PlanningStack = createNativeStackNavigator<PlanningStackParamList>();

function PlanningStackNavigator() {
  return (
    <PlanningStack.Navigator initialRouteName="PlanHistory" screenOptions={{ headerShown: false }}>
      <PlanningStack.Screen name="PlanHistory" component={PlanHistoryScreen} />
      <PlanningStack.Screen name="PlanConfig" component={PlanConfigScreen} />
      <PlanningStack.Screen name="RecipeSelection" component={RecipeSelectionScreen} />
      <PlanningStack.Screen name="PlanCalendar" component={PlanCalendarScreen} />
    </PlanningStack.Navigator>
  );
}

const ShoppingStack = createNativeStackNavigator<ShoppingStackParamList>();

function ShoppingStackNavigator() {
  return (
    // CAMBIO: Ahora el initialRouteName es ShoppingHub
    <ShoppingStack.Navigator initialRouteName="ShoppingHub" screenOptions={{ headerShown: false }}>
      <ShoppingStack.Screen name="ShoppingHub" component={ShoppingHubScreen} />
      <ShoppingStack.Screen name="CustomListBuilder" component={CustomListBuilderScreen} />
      <ShoppingStack.Screen name="ShoppingList" component={ShoppingListScreen} />
    </ShoppingStack.Navigator>
  );
}

import { Text } from 'react-native';
import { useI18n } from '../i18n';
import { useTheme } from '../context/ThemeContext';

// --- Main tab navigator ---

const Tab = createBottomTabNavigator<MainTabParamList>();

/** Renders a tab-bar icon as an emoji. */
const tabEmoji = (emoji: string) => ({ focused }: { focused: boolean }) => (
  <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
);

export function AppNavigator() {
  const { t } = useI18n();
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        // When leaving a tab, reset its nested stack to the first screen so
        // returning to the tab always starts at that tab's home screen.
        popToTopOnBlur: true,
        tabBarActiveTintColor: colors.navActive,
        tabBarInactiveTintColor: colors.navInactive,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tab.Screen
        name="RecipesTab"
        component={RecipeStackNavigator}
        options={{ tabBarLabel: t('navigation.recipes'), tabBarIcon: tabEmoji('📖') }}
      />
      <Tab.Screen
        name="PantryTab"
        component={PantryStackNavigator}
        options={{ tabBarLabel: t('navigation.pantry'), tabBarIcon: tabEmoji('🥫') }}
      />
      <Tab.Screen
        name="PlanningTab"
        component={PlanningStackNavigator}
        options={{ tabBarLabel: t('navigation.planning'), tabBarIcon: tabEmoji('🗓️') }}
      />
      <Tab.Screen
        name="ShoppingTab"
        component={ShoppingStackNavigator}
        options={{ tabBarLabel: t('navigation.shopping'), tabBarIcon: tabEmoji('🛒') }}
      />
    </Tab.Navigator>
  );
}