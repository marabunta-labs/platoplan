/**
 * PlatoPlan - Sidebar navigator for desktop/wide viewports
 * Uses @react-navigation/drawer with a permanent (always visible) drawer.
 * Provides the same screens as the bottom tab navigator.
 */

import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
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

// --- Stack navigators (same as AppNavigator) ---

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
      <PantryStack.Screen name="PantryList" component={PantryScreen} />
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
    // CAMBIO: Definimos ShoppingHub como initialRouteName e incluimos las 3 pantallas
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

// --- Drawer navigator ---

const Drawer = createDrawerNavigator<MainTabParamList>();

/** Renders a drawer item icon as an emoji. */
const drawerEmoji = (emoji: string) => () => <Text style={{ fontSize: 18 }}>{emoji}</Text>;

export function SidebarNavigator() {
  const { t } = useI18n();
  const { colors } = useTheme();

  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: false,
        drawerType: 'permanent',
        // Reset a section's nested stack to its first screen when leaving it.
        popToTopOnBlur: true,
        drawerActiveTintColor: colors.navActive,
        drawerInactiveTintColor: colors.navInactive,
        drawerStyle: {
          width: 240,
          backgroundColor: colors.surface,
          borderRightColor: colors.border,
        },
      }}
    >
      <Drawer.Screen
        name="RecipesTab"
        component={RecipeStackNavigator}
        options={{ drawerLabel: t('navigation.recipes'), drawerIcon: drawerEmoji('📖') }}
      />
      <Drawer.Screen
        name="PantryTab"
        component={PantryStackNavigator}
        options={{ drawerLabel: t('navigation.pantry'), drawerIcon: drawerEmoji('🥫') }}
      />
      <Drawer.Screen
        name="PlanningTab"
        component={PlanningStackNavigator}
        options={{ drawerLabel: t('navigation.planning'), drawerIcon: drawerEmoji('🗓️') }}
      />
      <Drawer.Screen
        name="ShoppingTab"
        component={ShoppingStackNavigator}
        options={{ drawerLabel: t('navigation.shopping'), drawerIcon: drawerEmoji('🛒') }}
      />
    </Drawer.Navigator>
  );
}