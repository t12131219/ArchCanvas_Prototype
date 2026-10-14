"""An input-dependent branch stays explicit rather than becoming a guessed path."""
from torch import nn


class WeatherCell(nn.Module):
    def forward(self, signal):
        if signal.sum() > 0:
            state = signal + 1
        else:
            state = signal * 2
        return state
