import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Truck,
  Fuel,
  Gauge as GaugeIcon,
  AlertTriangle,
  ClipboardList,
} from 'lucide-react';

import AppShell from '../components/Layout/AppShell.jsx';
import Card from '../components/UI/Card.jsx';
import Skeleton from '../components/UI/Skeleton.jsx';
import Modal from '../components/UI/Modal.jsx';
import Button from '../components/UI/Button.jsx';

import KpiCard from '../components/Dashboard/KpiCard.jsx';
import VehicleMap from '../components/Dashboard/VehicleMap.jsx';
import VehicleList from '../components/Dashboard/VehicleList.jsx';
import FuelGauge from '../components/Dashboard/FuelGauge.jsx';
import AlertPanel from '../components/Dashboard/AlertPanel.jsx';

import {
  VehicleAPI,
  AlertAPI,
} from '../api/endpoints.js';

import { subscribe } from '../socket/socket.js';
import { useToast } from '../context/ToastContext.jsx';

const TRIP_LOG_KEY =
  'freight_malawi_trip_logs';

function loadTripLogs() {
  try {
    return JSON.parse(
      localStorage.getItem(
        TRIP_LOG_KEY
      ) || '[]'
    );
  } catch {
    return [];
  }
}

export default function Dashboard() {
  const { showToast } =
    useToast();

  const [vehicles, setVehicles] =
    useState([]);

  const [alerts, setAlerts] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [
    selectedVehicleId,
    setSelectedVehicleId,
  ] = useState(null);

  const [search, setSearch] =
    useState('');

  const [
    acknowledgingId,
    setAcknowledgingId,
  ] = useState(null);

  const [tripPrompt, setTripPrompt] =
    useState(null);

  const [tripForm, setTripForm] =
    useState({
      origin: 'Lilongwe',
      destination: 'Blantyre',
      purpose: 'Freight delivery',
      cargoDescription: '',
      cargoWeightKg: '',
      notes: '',
    });

  const [
    tripSaving,
    setTripSaving,
  ] = useState(false);

  const engineStateRef =
    useRef(new Map());

  const loadData =
    useCallback(async () => {
      const [
        vehiclesRes,
        alertsRes,
      ] = await Promise.all([
        VehicleAPI.list(),
        AlertAPI.list(),
      ]);

      const vehicleList =
        vehiclesRes.data.vehicles ||
        [];

      const alertList =
        alertsRes.data.alerts ||
        [];

      setVehicles(
        vehicleList
      );

      setAlerts(
        alertList
      );

      setSelectedVehicleId(
        (previous) =>
          previous ||
          vehicleList[0]?.id ||
          null
      );
    }, []);

  useEffect(() => {
    loadData()
      .finally(() =>
        setLoading(false)
      );
  }, [loadData]);

  useEffect(() => {
    const offUpdate =
      subscribe(
        'vehicle:update',
        (payload) => {
          const previousEngineState =
            engineStateRef.current.get(
              payload.vehicleId
            );

          const engineStarted =
            payload.engineOn === true &&
            previousEngineState !== true;

          engineStateRef.current.set(
            payload.vehicleId,
            payload.engineOn === true
          );

          let currentVehicle =
            null;

          setVehicles(
            (previous) =>
              previous.map(
                (vehicle) => {
                  if (
                    vehicle.id !==
                    payload.vehicleId
                  ) {
                    return vehicle;
                  }

                  currentVehicle =
                    vehicle;

                  return {
                    ...vehicle,

                    latest_fuel_percent:
                      payload.fuelPercent,

                    latest_fuel_litres:
                      payload.fuelLevelLitres,

                    latest_speed:
                      payload.speed,

                    latest_latitude:
                      payload.latitude,

                    latest_longitude:
                      payload.longitude,

                    latest_heading:
                      payload.heading,

                    latest_recorded_at:
                      payload.timestamp ||
                      new Date().toISOString(),

                    latest_engine_on:
                      payload.engineOn,

                    latest_load_weight_kg:
                      payload.loadWeightKg,
                  };
                }
              )
          );

          if (
            engineStarted &&
            currentVehicle
          ) {
            setTripPrompt({
              vehicle: {
                ...currentVehicle,
                latest_load_weight_kg:
                  payload.loadWeightKg,
              },

              startedAt:
                payload.timestamp ||
                new Date().toISOString(),
            });

            setTripForm({
              origin: 'Lilongwe',
              destination: 'Blantyre',
              purpose:
                'Freight delivery',
              cargoDescription: '',
              cargoWeightKg:
                payload.loadWeightKg
                  ? String(
                      payload.loadWeightKg
                    )
                  : '',
              notes: '',
            });

            showToast(
              `${currentVehicle.name} engine started — trip log required`,
              'warning'
            );
          }
        }
      );

    const offAlert =
      subscribe(
        'alert:new',
        (alert) => {
          setAlerts(
            (previous) => [
              {
                ...alert,
                created_at:
                  alert.createdAt ||
                  new Date().toISOString(),
              },

              ...previous,
            ]
          );
        }
      );

    return () => {
      offUpdate();
      offAlert();
    };
  }, [showToast]);

  async function handleAcknowledge(
    alertId
  ) {
    setAcknowledgingId(
      alertId
    );

    try {
      await AlertAPI.acknowledge(
        alertId
      );

      setAlerts(
        (previous) =>
          previous.map(
            (alert) =>
              alert.id ===
              alertId
                ? {
                    ...alert,
                    acknowledged: 1,
                  }
                : alert
          )
      );

      showToast(
        'Alert acknowledged',
        'success'
      );
    } catch {
      showToast(
        'Could not acknowledge alert',
        'error'
      );
    } finally {
      setAcknowledgingId(
        null
      );
    }
  }

  function updateTripField(
    field,
    value
  ) {
    setTripForm(
      (current) => ({
        ...current,
        [field]: value,
      })
    );
  }

  function saveTripLog() {
    if (!tripPrompt) {
      return;
    }

    if (
      !tripForm.origin.trim() ||
      !tripForm.destination.trim()
    ) {
      showToast(
        'Origin and destination are required',
        'error'
      );

      return;
    }

    setTripSaving(true);

    const logs =
      loadTripLogs();

    logs.unshift({
      id: `${Date.now()}-${tripPrompt.vehicle.id}`,

      vehicleId:
        tripPrompt.vehicle.id,

      vehicleName:
        tripPrompt.vehicle.name,

      plate:
        tripPrompt.vehicle.license_plate,

      driver:
        tripPrompt.vehicle.driver_name,

      startedAt:
        tripPrompt.startedAt,

      ...tripForm,

      cargoWeightKg:
        tripForm.cargoWeightKg
          ? Number(
              tripForm.cargoWeightKg
            )
          : null,

      createdAt:
        new Date().toISOString(),
    });

    localStorage.setItem(
      TRIP_LOG_KEY,
      JSON.stringify(logs)
    );

    setTripSaving(false);
    setTripPrompt(null);

    showToast(
      'Trip logged successfully',
      'success'
    );
  }

  const activeVehicles =
    useMemo(
      () =>
        vehicles.filter(
          (vehicle) => {
            if (
              !vehicle.latest_recorded_at
            ) {
              return false;
            }

            return (
              Date.now() -
                new Date(
                  vehicle.latest_recorded_at
                ).getTime() <
              15 * 60 * 1000
            );
          }
        ).length,
      [vehicles]
    );

  const fleetFuelTotal =
    useMemo(
      () =>
        vehicles.reduce(
          (sum, vehicle) =>
            sum +
            Number(
              vehicle.latest_fuel_litres ||
                0
            ),
          0
        ),
      [vehicles]
    );

  const avgConsumption =
    3.3;

  const openAlerts =
    alerts.filter(
      (alert) =>
        !alert.acknowledged
    ).length;

  const criticalOpenAlerts =
    alerts.filter(
      (alert) =>
        !alert.acknowledged &&
        alert.severity ===
          'HIGH'
    ).length;

  const selectedVehicle =
    vehicles.find(
      (vehicle) =>
        vehicle.id ===
        selectedVehicleId
    );

  return (
    <AppShell
      title="Dashboard"
      searchValue={search}
      onSearchChange={
        setSearch
      }
    >
      <div className="kpi-grid">
        {loading ? (
          Array.from({
            length: 4,
          }).map(
            (_, index) => (
              <Skeleton
                key={index}
                height={92}
              />
            )
          )
        ) : (
          <>
            <KpiCard
              icon={Truck}
              label="Active Vehicles"
              value={
                activeVehicles
              }
              sub={`of ${vehicles.length} registered`}
            />

            <KpiCard
              icon={Fuel}
              label="Fleet Fuel"
              value={`${fleetFuelTotal.toFixed(
                0
              )} L`}
              sub="Latest reading per vehicle"
            />

            <KpiCard
              icon={GaugeIcon}
              label="Average Consumption"
              value={`${avgConsumption.toFixed(
                1
              )} km/L`}
              sub="Nominal fleet baseline"
            />

            <KpiCard
              icon={AlertTriangle}
              label="Open Alerts"
              value={openAlerts}
              sub={`${criticalOpenAlerts} critical`}
              danger={
                criticalOpenAlerts >
                0
              }
            />
          </>
        )}
      </div>

      <div className="dashboard-grid">
        <div className="side-stack">
          <Card
            title="Live Fleet Map"
            className="map-card"
            bodyClassName="map-card-body"
          >
            {loading ? (
              <Skeleton
                height={420}
              />
            ) : (
              <VehicleMap
                vehicles={
                  vehicles
                }
                selectedVehicleId={
                  selectedVehicleId
                }
                onSelectVehicle={
                  setSelectedVehicleId
                }
              />
            )}
          </Card>

          <Card title="Fleet Vehicles">
            {loading ? (
              <Skeleton
                height={160}
              />
            ) : (
              <VehicleList
                vehicles={
                  vehicles
                }
                selectedVehicleId={
                  selectedVehicleId
                }
                onSelectVehicle={
                  setSelectedVehicleId
                }
                searchValue={
                  search
                }
              />
            )}
          </Card>
        </div>

        <div className="side-stack">
          <Card
            title={
              selectedVehicle
                ? `${selectedVehicle.name} — Fuel Level`
                : 'Fuel Level'
            }
          >
            {loading ? (
              <Skeleton
                height={160}
              />
            ) : selectedVehicle ? (
              <FuelGauge
                percent={Number(
                  selectedVehicle.latest_fuel_percent ||
                    0
                )}
                litres={Number(
                  selectedVehicle.latest_fuel_litres ||
                    0
                )}
                capacity={Number(
                  selectedVehicle.fuel_tank_capacity
                )}
              />
            ) : (
              <p className="card-subtitle">
                Select a vehicle
                to view its fuel
                gauge.
              </p>
            )}
          </Card>

          <Card
            title="Recent Alerts"
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  (window.location.href =
                    '/alerts')
                }
              >
                <ClipboardList size={15} />
                View all
              </Button>
            }
          >
            {loading ? (
              <Skeleton
                height={200}
              />
            ) : (
              <AlertPanel
                alerts={alerts.slice(
                  0,
                  10
                )}
                onAcknowledge={
                  handleAcknowledge
                }
                acknowledgingId={
                  acknowledgingId
                }
              />
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(
          tripPrompt
        )}
        title={
          tripPrompt
            ? `Log trip — ${tripPrompt.vehicle.name}`
            : 'Log trip'
        }
        onClose={() =>
          setTripPrompt(null)
        }
        onConfirm={
          saveTripLog
        }
        confirmLabel="Log Trip"
        confirmLoading={
          tripSaving
        }
      >
        <p
          className="card-subtitle"
          style={{
            marginBottom: 16,
          }}
        >
          Engine start detected.
          Record the trip details
          before the vehicle
          departs.
        </p>

        <div className="form-group">
          <label
            className="form-label"
            htmlFor="trip-origin"
          >
            Origin
          </label>

          <input
            id="trip-origin"
            className="form-input"
            value={
              tripForm.origin
            }
            onChange={(event) =>
              updateTripField(
                'origin',
                event.target.value
              )
            }
          />
        </div>

        <div className="form-group">
          <label
            className="form-label"
            htmlFor="trip-destination"
          >
            Destination
          </label>

          <input
            id="trip-destination"
            className="form-input"
            value={
              tripForm.destination
            }
            onChange={(event) =>
              updateTripField(
                'destination',
                event.target.value
              )
            }
          />
        </div>

        <div className="form-group">
          <label
            className="form-label"
            htmlFor="trip-purpose"
          >
            Trip purpose
          </label>

          <select
            id="trip-purpose"
            className="form-input"
            value={
              tripForm.purpose
            }
            onChange={(event) =>
              updateTripField(
                'purpose',
                event.target.value
              )
            }
          >
            <option>
              Freight delivery
            </option>
            <option>
              Collection
            </option>
            <option>
              Transfer
            </option>
            <option>
              Return trip
            </option>
            <option>
              Other
            </option>
          </select>
        </div>

        <div className="form-group">
          <label
            className="form-label"
            htmlFor="trip-cargo"
          >
            Cargo description
          </label>

          <input
            id="trip-cargo"
            className="form-input"
            value={
              tripForm.cargoDescription
            }
            onChange={(event) =>
              updateTripField(
                'cargoDescription',
                event.target.value
              )
            }
            placeholder="e.g. maize, fertilizer, general freight"
          />
        </div>

        <div className="form-group">
          <label
            className="form-label"
            htmlFor="trip-weight"
          >
            Cargo weight (kg)
          </label>

          <input
            id="trip-weight"
            type="number"
            min="0"
            className="form-input"
            value={
              tripForm.cargoWeightKg
            }
            onChange={(event) =>
              updateTripField(
                'cargoWeightKg',
                event.target.value
              )
            }
          />
        </div>

        <div
          className="form-group"
          style={{
            marginBottom: 0,
          }}
        >
          <label
            className="form-label"
            htmlFor="trip-notes"
          >
            Notes
          </label>

          <textarea
            id="trip-notes"
            className="form-input"
            rows="3"
            value={
              tripForm.notes
            }
            onChange={(event) =>
              updateTripField(
                'notes',
                event.target.value
              )
            }
            placeholder="Optional trip notes"
            style={{
              height: 'auto',
              paddingTop: 10,
              paddingBottom: 10,
              resize: 'vertical',
            }}
          />
        </div>
      </Modal>
    </AppShell>
  );
}